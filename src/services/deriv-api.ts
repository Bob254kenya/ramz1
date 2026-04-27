// =============================
// CONFIG
// =============================
const DERIV_APP_ID = 131592;
const DERIV_OAUTH_URL = `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_APP_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=token&scope=read,trade&state=${generateState()}`;;

// Generate secure state
function generateState(): string {
  return Math.random().toString(36).substring(2) + Date.now();
}

// OAuth URL (FIXED)
export function getOAuthUrl(): string {
  const state = generateState();
  localStorage.setItem('oauth_state', state);

  return `https://oauth.deriv.com/oauth2/authorize?app_id=${DERIV_APP_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=token&scope=read,trade&state=${state}`;
}

// =============================
// TYPES
// =============================
export interface DerivAccount {
  loginid: string;
  token: string;
  currency: string;
  is_virtual: boolean;
}

export interface AuthorizeResponse {
  authorize: {
    loginid: string;
    balance: number;
    currency: string;
    is_virtual: number;
    email: string;
    fullname: string;
    account_list: Array<{
      loginid: string;
      currency: string;
      is_virtual: number;
    }>;
  };
}

export interface ContractResult {
  contractId: string;
  profit: number;
  status: 'won' | 'lost' | 'open';
  isExpired: boolean;
  buyPrice: number;
  sellPrice: number;
}

export type MessageHandler = (data: any) => void;

// =============================
// MAIN CLASS
// =============================
class DerivAPI {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private handlers = new Map<number, (data: any) => void>();
  private subscriptionHandlers = new Map<string, MessageHandler[]>();
  private tickSubscriptions = new Map<string, string>();
  private globalHandlers: MessageHandler[] = [];
  private connected = false;
  private connectPromise: Promise<void> | null = null;
  private activeCurrency: string = 'USD';

  get isConnected() {
    return this.connected;
  }

  setActiveCurrency(currency: string) {
    this.activeCurrency = currency;
  }

  // =============================
  // CONNECT (AUTO RECONNECT)
  // =============================
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(DERIV_WS_URL);

      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.req_id && this.handlers.has(data.req_id)) {
          this.handlers.get(data.req_id)!(data);
          this.handlers.delete(data.req_id);
        }

        if (data.tick) {
          const symbol = data.tick.symbol;
          const handlers = this.subscriptionHandlers.get(symbol) || [];
          handlers.forEach(h => h(data));
        }

        this.globalHandlers.forEach(h => h(data));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connectPromise = null;

        // AUTO RECONNECT
        setTimeout(() => {
          this.connect().catch(() => {});
        }, 2000);
      };

      this.ws.onerror = (err) => {
        this.connected = false;
        this.connectPromise = null;
        reject(err);
      };
    });

    return this.connectPromise;
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.connectPromise = null;
    this.handlers.clear();
    this.subscriptionHandlers.clear();
    this.tickSubscriptions.clear();
  }

  // =============================
  // SAFE SEND (AUTO CONNECT)
  // =============================
  private async send(data: any): Promise<any> {
    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const reqId = ++this.reqId;
      data.req_id = reqId;

      this.handlers.set(reqId, resolve);
      this.ws.send(JSON.stringify(data));

      setTimeout(() => {
        if (this.handlers.has(reqId)) {
          this.handlers.delete(reqId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  // =============================
  // AUTH
  // =============================
  async authorize(token: string): Promise<AuthorizeResponse> {
    const response = await this.send({ authorize: token });

    if (response.error) throw new Error(response.error.message);

    if (response.authorize?.currency) {
      this.setActiveCurrency(response.authorize.currency);
    }

    return response;
  }

  // =============================
  // BALANCE STREAM
  // =============================
  async subscribeBalance(handler: MessageHandler) {
    await this.send({ balance: 1, subscribe: 1 });

    this.globalHandlers.push((data) => {
      if (data.balance) handler(data);
    });
  }

  // =============================
  // TICKS (FIXED)
  // =============================
  async subscribeTicks(symbol: string, handler: MessageHandler) {
    const list = this.subscriptionHandlers.get(symbol) || [];
    list.push(handler);
    this.subscriptionHandlers.set(symbol, list);

    if (list.length === 1) {
      const res = await this.send({ ticks: symbol, subscribe: 1 });
      this.tickSubscriptions.set(symbol, res.subscription.id);
    }
  }

  async unsubscribeTicks(symbol: string) {
    this.subscriptionHandlers.delete(symbol);

    const subId = this.tickSubscriptions.get(symbol);
    if (subId) {
      await this.send({ forget: subId });
      this.tickSubscriptions.delete(symbol);
    }
  }

  // =============================
  // BUY CONTRACT
  // =============================
  async buyContract(params: any) {
    const proposal = await this.send({
      proposal: 1,
      ...params,
      currency: params.currency || this.activeCurrency,
    });

    if (proposal.error) throw new Error(proposal.error.message);

    const buy = await this.send({
      buy: proposal.proposal.id,
      price: params.amount,
    });

    if (buy.error) throw new Error(buy.error.message);

    return {
      contractId: String(buy.buy.contract_id),
      buyPrice: buy.buy.buy_price,
    };
  }

  // =============================
  // WAIT RESULT (FIXED)
  // =============================
  waitForContractResult(contractId: string, duration: number): Promise<ContractResult> {
    return new Promise((resolve, reject) => {
      let subId: string | null = null;

      const timeout = setTimeout(() => {
        reject(new Error('Timeout'));
      }, duration * 2000 + 10000);

      const handler = (data: any) => {
        const poc = data.proposal_open_contract;
        if (!poc) return;
        if (String(poc.contract_id) !== contractId) return;

        const settled = poc.is_expired || poc.is_sold;

        if (settled) {
          clearTimeout(timeout);

          if (subId) this.send({ forget: subId });

          this.globalHandlers = this.globalHandlers.filter(h => h !== handler);

          const profit = typeof poc.profit === 'number'
            ? poc.profit
            : (poc.sell_price ?? 0) - (poc.buy_price ?? 0);

          resolve({
            contractId,
            profit,
            status: profit > 0 ? 'won' : 'lost',
            isExpired: poc.is_expired === 1,
            buyPrice: poc.buy_price || 0,
            sellPrice: poc.sell_price || 0,
          });
        }
      };

      this.globalHandlers.push(handler);

      this.send({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      }).then(res => {
        subId = res.subscription?.id;
        handler(res);
      }).catch(reject);
    });
  }

  // =============================
  // UTIL
  // =============================
  extractLastDigit(price: number): number {
    return Number(price.toString().slice(-1));
  }

  onMessage(handler: MessageHandler) {
    this.globalHandlers.push(handler);
    return () => {
      this.globalHandlers = this.globalHandlers.filter(h => h !== handler);
    };
  }
}

// =============================
// INSTANCE
// =============================
export const derivApi = new DerivAPI();

// =============================
// OAUTH PARSER (SECURE)
// =============================
export function parseOAuthRedirect(search: string): DerivAccount[] {
  const params = new URLSearchParams(search);

  const state = params.get('state');
  const saved = localStorage.getItem('oauth_state');

  if (state !== saved) {
    throw new Error('Invalid OAuth state');
  }

  const accounts: DerivAccount[] = [];
  let i = 1;

  while (params.has(`acct${i}`)) {
    accounts.push({
      loginid: params.get(`acct${i}`)!,
      token: params.get(`token${i}`)!,
      currency: params.get(`cur${i}`) || 'USD',
      is_virtual: params.get(`acct${i}`)!.startsWith('VRTC'),
    });
    i++;
  }

  return accounts;
}
