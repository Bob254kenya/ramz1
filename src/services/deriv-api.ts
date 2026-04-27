// =============================
// CONFIG
// =============================
const DERIV_APP_ID = 131592;
const DERIV_WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=131592"; // Added missing WebSocket URL

// Generate secure state
function generateState(): string {
  return Math.random().toString(36).substring(2) + Date.now();
}

// OAuth URL (FIXED - removed duplicate/incomplete version)
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
          const handler = this.handlers.get(data.req_id);
          if (handler) {
            handler(data);
            this.handlers.delete(data.req_id);
          }
        }

        // Handle tick messages
        if (data.tick) {
          const symbol = data.tick.symbol;
          const handlers = this.subscriptionHandlers.get(symbol);
          if (handlers) {
            handlers.forEach(h => h(data));
          }
        }

        this.globalHandlers.forEach(h => h(data));
      };

      this.ws.onclose = () => {
        this.connected = false;
        this.connectPromise = null;

        // AUTO RECONNECT with delay
        setTimeout(() => {
          if (!this.connected) {
            this.connect().catch(() => {});
          }
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connectPromise = null;
    this.handlers.clear();
    this.subscriptionHandlers.clear();
    this.tickSubscriptions.clear();
    this.globalHandlers = [];
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
      
      try {
        this.ws.send(JSON.stringify(data));
      } catch (error) {
        this.handlers.delete(reqId);
        reject(error);
        return;
      }

      setTimeout(() => {
        if (this.handlers.has(reqId)) {
          this.handlers.delete(reqId);
          reject(new Error(`Request timeout for ${Object.keys(data)[0]}`));
        }
      }, 30000);
    });
  }

  // =============================
  // AUTH
  // =============================
  async authorize(token: string): Promise<AuthorizeResponse> {
    const response = await this.send({ authorize: token });

    if (response.error) {
      throw new Error(response.error.message || response.error.code);
    }

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

    const balanceHandler = (data: any) => {
      if (data.balance) handler(data);
    };
    
    this.globalHandlers.push(balanceHandler);
    
    // Return unsubscribe function
    return () => {
      this.globalHandlers = this.globalHandlers.filter(h => h !== balanceHandler);
    };
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
      if (res.subscription?.id) {
        this.tickSubscriptions.set(symbol, res.subscription.id);
      }
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
    // First get proposal
    const proposal = await this.send({
      proposal: 1,
      amount: params.amount,
      basis: 'stake',
      contract_type: params.contract_type,
      currency: params.currency || this.activeCurrency,
      duration: params.duration,
      duration_unit: params.duration_unit || 't',
      symbol: params.symbol,
    });

    if (proposal.error) {
      throw new Error(proposal.error.message);
    }

    if (!proposal.proposal?.id) {
      throw new Error('No proposal ID received');
    }

    // Then buy the contract
    const buy = await this.send({
      buy: proposal.proposal.id,
      price: params.amount,
    });

    if (buy.error) {
      throw new Error(buy.error.message);
    }

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
      let isResolved = false;

      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          if (subId) {
            this.send({ forget: subId }).catch(() => {});
          }
          reject(new Error(`Timeout waiting for contract ${contractId}`));
        }
      }, duration * 2000 + 10000);

      const handler = (data: any) => {
        if (isResolved) return;
        
        const poc = data.proposal_open_contract;
        if (!poc) return;
        
        if (String(poc.contract_id) !== contractId) return;

        const isSold = poc.is_sold === 1;
        const isExpired = poc.is_expired === 1;
        const settled = isExpired || isSold;

        if (settled) {
          isResolved = true;
          clearTimeout(timeout);

          // Unsubscribe
          if (subId) {
            this.send({ forget: subId }).catch(() => {});
          }

          // Remove handler
          const index = this.globalHandlers.indexOf(handler);
          if (index !== -1) {
            this.globalHandlers.splice(index, 1);
          }

          // Calculate profit
          let profit = 0;
          if (typeof poc.profit === 'number') {
            profit = poc.profit;
          } else if (typeof poc.sell_price === 'number' && typeof poc.buy_price === 'number') {
            profit = poc.sell_price - poc.buy_price;
          }

          resolve({
            contractId,
            profit,
            status: profit > 0 ? 'won' : profit < 0 ? 'lost' : 'open',
            isExpired,
            buyPrice: poc.buy_price || 0,
            sellPrice: poc.sell_price || 0,
          });
        }
      };

      this.globalHandlers.push(handler);

      // Subscribe to contract updates
      this.send({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      })
        .then(res => {
          if (res.subscription?.id) {
            subId = res.subscription.id;
          }
          // Check initial state
          handler(res);
        })
        .catch(error => {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeout);
            const index = this.globalHandlers.indexOf(handler);
            if (index !== -1) {
              this.globalHandlers.splice(index, 1);
            }
            reject(error);
          }
        });
    });
  }

  // =============================
  // UTIL
  // =============================
  extractLastDigit(price: number): number {
    const str = price.toString();
    const match = str.match(/\d/);
    if (match) {
      return parseInt(str.slice(-1));
    }
    return 0;
  }

  onMessage(handler: MessageHandler) {
    this.globalHandlers.push(handler);
    return () => {
      const index = this.globalHandlers.indexOf(handler);
      if (index !== -1) {
        this.globalHandlers.splice(index, 1);
      }
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
    localStorage.removeItem('oauth_state'); // Clear invalid state
    throw new Error('Invalid OAuth state - possible CSRF attack');
  }

  // Clear used state
  localStorage.removeItem('oauth_state');

  const accounts: DerivAccount[] = [];
  let i = 1;

  while (params.has(`acct${i}`)) {
    const loginid = params.get(`acct${i}`);
    const token = params.get(`token${i}`);
    const currency = params.get(`cur${i}`) || 'USD';
    
    if (loginid && token) {
      accounts.push({
        loginid,
        token,
        currency,
        is_virtual: loginid.startsWith('VRTC'),
      });
    }
    i++;
  }

  return accounts;
}
