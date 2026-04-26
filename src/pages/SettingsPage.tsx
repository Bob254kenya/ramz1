import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { derivApi, type MarketSymbol } from '@/services/deriv-api';
import { getLastDigit } from '@/services/analysis';
import { copyTradingService } from '@/services/copy-trading-service';
import { useLossRequirement } from '@/hooks/useLossRequirement';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Play, StopCircle, Trash2, Home, RefreshCw, Shield, Zap, Eye, Anchor, Trophy,
  TrendingUp, TrendingDown, BarChart3, Volume2, VolumeX, Wifi, WifiOff, GripVertical, Combine
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// ============================================
// MARKET CONFIGURATION
// ============================================

const ALL_MARKETS: { symbol: string; name: string; group: string }[] = [
  { symbol: '1HZ10V', name: 'Volatility 10 (1s)', group: 'vol1s' },
  { symbol: '1HZ15V', name: 'Volatility 15 (1s)', group: 'vol1s' },
  { symbol: '1HZ25V', name: 'Volatility 25 (1s)', group: 'vol1s' },
  { symbol: '1HZ30V', name: 'Volatility 30 (1s)', group: 'vol1s' },
  { symbol: '1HZ50V', name: 'Volatility 50 (1s)', group: 'vol1s' },
  { symbol: '1HZ75V', name: 'Volatility 75 (1s)', group: 'vol1s' },
  { symbol: '1HZ90V', name: 'Volatility 90 (1s)', group: 'vol1s' },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s)', group: 'vol1s' },
  { symbol: 'R_10', name: 'Volatility 10 Index', group: 'vol' },
  { symbol: 'R_25', name: 'Volatility 25 Index', group: 'vol' },
  { symbol: 'R_50', name: 'Volatility 50 Index', group: 'vol' },
  { symbol: 'R_75', name: 'Volatility 75 Index', group: 'vol' },
  { symbol: 'R_100', name: 'Volatility 100 Index', group: 'vol' },
  { symbol: 'R_150', name: 'Volatility 150 Index', group: 'vol' },
  { symbol: 'JD10', name: 'Jump 10', group: 'jump' },
  { symbol: 'JD25', name: 'Jump 25', group: 'jump' },
  { symbol: 'JD50', name: 'Jump 50', group: 'jump' },
  { symbol: 'JD75', name: 'Jump 75', group: 'jump' },
  { symbol: 'JD100', name: 'Jump 100', group: 'jump' },
  { symbol: 'RDBEAR', name: 'Bear Market', group: 'bear' },
  { symbol: 'RDBULL', name: 'Bull Market', group: 'bull' },
  { symbol: 'stpRNG', name: 'Step Index', group: 'step' },
  { symbol: 'RBRK100', name: 'Range Break 100', group: 'range' },
  { symbol: 'RBRK200', name: 'Range Break 200', group: 'range' },
];

const CONTRACT_TYPES = [
  'DIGITEVEN', 'DIGITODD', 'DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER',
] as const;

const needsBarrier = (ct: string) => ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(ct);

type BotStatus = 'idle' | 'trading_m1' | 'recovery' | 'waiting_pattern' | 'pattern_matched' | 'virtual_hook' | 'reconnecting';

interface LogEntry {
  id: number;
  time: string;
  market: 'M1' | 'M2' | 'VH' | 'SYSTEM' | 'COMBINED';
  symbol: string;
  contract: string;
  stake: number;
  martingaleStep: number;
  exitDigit: string;
  result: 'Win' | 'Loss' | 'Pending' | 'V-Win' | 'V-Loss' | 'Failed';
  pnl: number;
  balance: number;
  switchInfo: string;
}

// ============================================
// TP/SL NOTIFICATION POPUP
// ============================================

const notificationStyles = `
@keyframes slideUpCenter {
  from { opacity: 0; transform: translateY(30px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes slideDownCenter {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(30px) scale(0.95); }
}
@keyframes float {
  0% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(5deg); }
  100% { transform: translateY(0px) rotate(0deg); }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
.animate-slide-up-center { animation: slideUpCenter 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) forwards; }
.animate-slide-down-center { animation: slideDownCenter 0.3s ease-out forwards; }
.animate-float { animation: float 3s ease-in-out infinite; }
.animate-bounce { animation: bounce 0.4s ease-in-out 2; }
.animate-pulse-slow { animation: pulse 1s ease-in-out infinite; }
`;

const showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
  if (typeof window !== 'undefined' && (window as any).showTPNotification) {
    (window as any).showTPNotification(type, message, amount);
  }
};

const TPSLNotificationPopup = () => {
  const [notification, setNotification] = useState<{ type: 'tp' | 'sl'; message: string; amount?: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    (window as any).showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
      setNotification({ type, message, amount });
      setIsVisible(true);
      setIsExiting(false);
      const timeout = setTimeout(() => handleClose(), 8000);
      return () => clearTimeout(timeout);
    };
    return () => { delete (window as any).showTPNotification; };
  }, []);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setNotification(null);
      setIsExiting(false);
    }, 300);
  };

  if (!isVisible || !notification) return null;

  const isTP = notification.type === 'tp';
  const amount = notification.amount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className={`pointer-events-auto w-[400px] h-[280px] rounded-xl shadow-2xl overflow-hidden ${isExiting ? 'animate-slide-down-center' : 'animate-slide-up-center'}`}>
        <div className={`relative w-full h-full overflow-hidden ${isTP ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' : 'bg-gradient-to-br from-rose-500 to-rose-700'}`}>
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="absolute animate-float" style={{ left: `${Math.random() * 100}%`, bottom: '-30px', fontSize: `${12 + Math.random() * 20}px`, opacity: 0.25, animationDelay: `${Math.random() * 12}s`, animationDuration: `${6 + Math.random() * 8}s`, color: isTP ? '#10b981' : '#f43f5e', pointerEvents: 'none' }}>
                {isTP ? '💰' : '😢'}
              </div>
            ))}
          </div>
          <div className="relative w-full h-full flex flex-col p-4 z-10">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${isTP ? 'bg-emerald-400/30' : 'bg-rose-400/30'} shadow-lg backdrop-blur-sm animate-pulse-slow`}>
                {isTP ? '🎉' : '😢'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{isTP ? 'TAKE PROFIT!' : 'STOP LOSS!'}</h3>
                <p className="text-[10px] text-white/70">{new Date().toLocaleTimeString()}</p>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-white text-sm font-medium">{notification.message}</p>
              {amount && (
                <p className={`text-2xl font-bold mt-2 ${isTP ? 'text-emerald-200' : 'text-rose-200'} animate-bounce`}>
                  {isTP ? '+' : '-'}${Math.abs(amount).toFixed(2)}
                </p>
              )}
            </div>
            <button onClick={handleClose} className={`w-full py-2 rounded-lg font-semibold text-sm transition-all duration-200 ${isTP ? 'bg-white/95 text-emerald-600 hover:bg-white' : 'bg-white/95 text-rose-600 hover:bg-white'} transform active:scale-[0.98] shadow-lg`}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// HELPER FUNCTIONS
// ============================================

class CircularTickBuffer {
  private buffer: { digit: number; ts: number }[];
  private head = 0;
  private count = 0;
  constructor(private capacity = 1000) {
    this.buffer = new Array(capacity);
  }
  push(digit: number) {
    this.buffer[this.head] = { digit, ts: performance.now() };
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }
  last(n: number): number[] {
    const result: number[] = [];
    const start = (this.head - Math.min(n, this.count) + this.capacity) % this.capacity;
    for (let i = 0; i < Math.min(n, this.count); i++) {
      result.push(this.buffer[(start + i) % this.capacity].digit);
    }
    return result;
  }
  get size() { return this.count; }
}

function waitForNextTick(symbol: string): Promise<{ quote: number }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { unsub(); resolve({ quote: 0 }); }, 5000);
    const unsub = derivApi.onMessage((data: any) => {
      if (data.tick && data.tick.symbol === symbol) {
        clearTimeout(timeout);
        unsub();
        resolve({ quote: data.tick.quote });
      }
    });
  });
}

function simulateVirtualContract(contractType: string, barrier: string, symbol: string): Promise<{ won: boolean; digit: number }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { unsub(); reject(new Error('Virtual contract timeout')); }, 5000);
    const unsub = derivApi.onMessage((data: any) => {
      if (data.tick && data.tick.symbol === symbol) {
        clearTimeout(timeout);
        unsub();
        const digit = getLastDigit(data.tick.quote);
        const b = parseInt(barrier) || 0;
        let won = false;
        switch (contractType) {
          case 'DIGITEVEN': won = digit % 2 === 0; break;
          case 'DIGITODD': won = digit % 2 !== 0; break;
          case 'DIGITMATCH': won = digit === b; break;
          case 'DIGITDIFF': won = digit !== b; break;
          case 'DIGITOVER': won = digit > b; break;
          case 'DIGITUNDER': won = digit < b; break;
        }
        resolve({ won, digit });
      }
    });
  });
}

function checkCombinedPattern(digits: number[], patternStr: string): boolean {
  if (!patternStr || patternStr.trim() === '') return false;
  const patterns = patternStr.split(',').map(p => p.trim().toUpperCase()).filter(p => p.length > 0);
  if (patterns.length === 0) return false;
  
  for (const pattern of patterns) {
    let matched = true;
    const len = pattern.length;
    if (digits.length < len) { matched = false; continue; }
    const recentDigits = digits.slice(-len);
    
    for (let i = 0; i < len; i++) {
      const patternChar = pattern[i];
      const digit = recentDigits[i];
      const isOver = digit > 4;
      const isEven = digit % 2 === 0;
      
      if (patternChar === 'U') { if (!(digit < 5)) { matched = false; break; } }
      else if (patternChar === 'O') { if (!(digit > 4)) { matched = false; break; } }
      else if (patternChar === 'E') { if (!isEven) { matched = false; break; } }
      else if (patternChar >= '0' && patternChar <= '9') { if (digit !== parseInt(patternChar)) { matched = false; break; } }
      else if (patternChar === 'O') { if (isEven) { matched = false; break; } }
      else { matched = false; break; }
    }
    if (matched) return true;
  }
  return false;
}

export default function RamzfxSpeedBot() {
  const { isAuthorized, balance: authBalance, activeAccount, refreshBalance } = useAuth();
  const { recordLoss } = useLossRequirement();
  
  // ========== M1 CONFIGURATION ==========
  const [m1Enabled, setM1Enabled] = useState(true);
  const [m1Symbol, setM1Symbol] = useState('R_100');
  const [m1Contract, setM1Contract] = useState('DIGITEVEN');
  const [m1Barrier, setM1Barrier] = useState('5');
  const [m1HookEnabled, setM1HookEnabled] = useState(false);
  const [m1VirtualLossCount, setM1VirtualLossCount] = useState('3');
  const [m1RealCount, setM1RealCount] = useState('2');
  const [m1StrategyEnabled, setM1StrategyEnabled] = useState(false);
  const [m1StrategyMode, setM1StrategyMode] = useState<'pattern' | 'digit'>('pattern');
  const [m1Pattern, setM1Pattern] = useState('');
  const [m1DigitCondition, setM1DigitCondition] = useState('==');
  const [m1DigitCompare, setM1DigitCompare] = useState('5');
  const [m1DigitWindow, setM1DigitWindow] = useState('3');
  const [m1CombinedEnabled, setM1CombinedEnabled] = useState(false);
  const [m1CombinedPatterns, setM1CombinedPatterns] = useState('');
  
  // ========== M2 CONFIGURATION (RECOVERY) ==========
  const [m2Enabled, setM2Enabled] = useState(true);
  const [m2Symbol, setM2Symbol] = useState('R_50');
  const [m2Contract, setM2Contract] = useState('DIGITODD');
  const [m2Barrier, setM2Barrier] = useState('5');
  const [m2HookEnabled, setM2HookEnabled] = useState(false);
  const [m2VirtualLossCount, setM2VirtualLossCount] = useState('3');
  const [m2RealCount, setM2RealCount] = useState('2');
  const [m2StrategyEnabled, setM2StrategyEnabled] = useState(false);
  const [m2StrategyMode, setM2StrategyMode] = useState<'pattern' | 'digit'>('pattern');
  const [m2Pattern, setM2Pattern] = useState('');
  const [m2DigitCondition, setM2DigitCondition] = useState('==');
  const [m2DigitCompare, setM2DigitCompare] = useState('5');
  const [m2DigitWindow, setM2DigitWindow] = useState('3');
  const [m2CombinedEnabled, setM2CombinedEnabled] = useState(false);
  const [m2CombinedPatterns, setM2CombinedPatterns] = useState('');
  
  // ========== GLOBAL SETTINGS ==========
  const [stake, setStake] = useState('0.6');
  const [martingaleOn, setMartingaleOn] = useState(false);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2.0');
  const [martingaleMaxSteps, setMartingaleMaxSteps] = useState('5');
  const [takeProfit, setTakeProfit] = useState('5');
  const [stopLoss, setStopLoss] = useState('30');
  const [turboMode, setTurboMode] = useState(true);
  
  // ========== BOT STATE ==========
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const shouldStopRef = useRef(false);
  const [botStatus, setBotStatus] = useState<BotStatus>('idle');
  const [currentMarket, setCurrentMarket] = useState<1 | 2>(1);
  const [currentStake, setCurrentStakeState] = useState(0);
  const [martingaleStep, setMartingaleStepState] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [localBalance, setLocalBalance] = useState(authBalance);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [totalStaked, setTotalStaked] = useState(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);
  
  // Virtual hook state
  const [vhFakeWins, setVhFakeWins] = useState(0);
  const [vhFakeLosses, setVhFakeLosses] = useState(0);
  const [vhConsecLosses, setVhConsecLosses] = useState(0);
  const [vhStatus, setVhStatus] = useState<'idle' | 'waiting' | 'confirmed' | 'failed'>('idle');
  const patternTradeTakenRef = useRef(false);
  const combinedTradeTakenRef = useRef(false);
  
  // Tick storage
  const tickMapRef = useRef<Map<string, number[]>>(new Map());
  const [tickCounts, setTickCounts] = useState<Record<string, number>>({});
  
  // Connection
  const [isConnected, setIsConnected] = useState(derivApi.isConnected);
  
  // ========== HELPERS ==========
  const addLog = useCallback((entry: Omit<LogEntry, 'id'>) => {
    const id = ++logIdRef.current;
    setLogEntries(prev => [{ ...entry, id }, ...prev].slice(0, 100));
    return id;
  }, []);
  
  const updateLog = useCallback((id: number, updates: Partial<LogEntry>) => {
    setLogEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);
  
  const clearLog = useCallback(() => {
    setLogEntries([]);
    setWins(0); setLosses(0); setTotalStaked(0); setNetProfit(0);
    setMartingaleStepState(0);
    setVhFakeWins(0); setVhFakeLosses(0); setVhConsecLosses(0); setVhStatus('idle');
    patternTradeTakenRef.current = false;
    combinedTradeTakenRef.current = false;
    shouldStopRef.current = false;
  }, []);
  
  const ensureConnection = useCallback(async (): Promise<boolean> => {
    if (derivApi.isConnected) {
      setIsConnected(true);
      return true;
    }
    try {
      await derivApi.connect();
      await new Promise(r => setTimeout(r, 2000));
      setIsConnected(derivApi.isConnected);
      return derivApi.isConnected;
    } catch (error) {
      setIsConnected(false);
      return false;
    }
  }, []);
  
  // ========== STRATEGY CHECKING ==========
  const cleanM1Pattern = m1Pattern.toUpperCase().replace(/[^EO]/g, '');
  const m1PatternValid = cleanM1Pattern.length >= 2;
  const cleanM2Pattern = m2Pattern.toUpperCase().replace(/[^EO]/g, '');
  const m2PatternValid = cleanM2Pattern.length >= 2;
  
  const checkPatternMatch = useCallback((symbol: string, pattern: string): boolean => {
    const digits = tickMapRef.current.get(symbol) || [];
    if (digits.length < pattern.length) return false;
    const recent = digits.slice(-pattern.length);
    for (let i = 0; i < pattern.length; i++) {
      const expected = pattern[i];
      const actual = recent[i] % 2 === 0 ? 'E' : 'O';
      if (expected !== actual) return false;
    }
    return true;
  }, []);
  
  const checkDigitCondition = useCallback((symbol: string, condition: string, compare: string, windowStr: string): boolean => {
    const digits = tickMapRef.current.get(symbol) || [];
    const win = parseInt(windowStr) || 3;
    const comp = parseInt(compare);
    if (digits.length < win) return false;
    const recent = digits.slice(-win);
    return recent.every(d => {
      switch (condition) {
        case '>': return d > comp;
        case '<': return d < comp;
        case '>=': return d >= comp;
        case '<=': return d <= comp;
        case '==': return d === comp;
        default: return false;
      }
    });
  }, []);
  
  const checkCombinedForSymbol = useCallback((symbol: string, patterns: string): boolean => {
    if (!patterns || patterns.trim() === '') return false;
    const digits = tickMapRef.current.get(symbol) || [];
    return checkCombinedPattern(digits, patterns);
  }, []);
  
  const checkStrategyForMarket = useCallback((market: 1 | 2, symbol: string): boolean => {
    if (market === 1 && m1StrategyEnabled) {
      if (m1StrategyMode === 'pattern') return checkPatternMatch(symbol, cleanM1Pattern);
      else return checkDigitCondition(symbol, m1DigitCondition, m1DigitCompare, m1DigitWindow);
    }
    if (market === 2 && m2StrategyEnabled) {
      if (m2StrategyMode === 'pattern') return checkPatternMatch(symbol, cleanM2Pattern);
      else return checkDigitCondition(symbol, m2DigitCondition, m2DigitCompare, m2DigitWindow);
    }
    return true;
  }, [m1StrategyEnabled, m2StrategyEnabled, m1StrategyMode, m2StrategyMode, cleanM1Pattern, cleanM2Pattern, checkPatternMatch, checkDigitCondition, m1DigitCondition, m1DigitCompare, m1DigitWindow, m2DigitCondition, m2DigitCompare, m2DigitWindow]);
  
  const checkCombinedForMarket = useCallback((market: 1 | 2, symbol: string): boolean => {
    if (market === 1 && m1CombinedEnabled) return checkCombinedForSymbol(symbol, m1CombinedPatterns);
    if (market === 2 && m2CombinedEnabled) return checkCombinedForSymbol(symbol, m2CombinedPatterns);
    return false;
  }, [m1CombinedEnabled, m2CombinedEnabled, m1CombinedPatterns, m2CombinedPatterns, checkCombinedForSymbol]);
  
  // ========== TICK SUBSCRIPTION ==========
  useEffect(() => {
    if (!derivApi.isConnected) return;
    let active = true;
    const handler = (data: any) => {
      if (!data.tick || !active) return;
      const sym = data.tick.symbol as string;
      const digit = getLastDigit(data.tick.quote);
      const arr = tickMapRef.current.get(sym) || [];
      arr.push(digit);
      if (arr.length > 200) arr.shift();
      tickMapRef.current.set(sym, arr);
      setTickCounts(prev => ({ ...prev, [sym]: arr.length }));
    };
    const unsub = derivApi.onMessage(handler);
    ALL_MARKETS.forEach(m => { derivApi.subscribeTicks(m.symbol as MarketSymbol, () => {}).catch(() => {}); });
    return () => { active = false; unsub(); };
  }, []);
  
  // ========== BALANCE SYNC ==========
  useEffect(() => {
    setLocalBalance(authBalance);
  }, [authBalance]);
  
  // ========== EXECUTE REAL TRADE ==========
  const executeRealTrade = useCallback(async (
    cfg: { contract: string; barrier: string; symbol: string },
    tradeSymbol: string,
    cStake: number,
    mStep: number,
    mkt: 1 | 2,
    currentBalance: number,
    currentPnl: number,
    baseStake: number,
  ): Promise<{ 
    localPnl: number; 
    localBalance: number; 
    cStake: number; 
    mStep: number; 
    inRecovery: boolean; 
    shouldBreak: boolean;
    won: boolean;
    contractExecuted: boolean;
  }> => {
    if (!derivApi.isConnected) {
      const connected = await ensureConnection();
      if (!connected) throw new Error('No connection available');
    }
    
    if (currentBalance < cStake) {
      addLog({
        time: new Date().toLocaleTimeString(),
        market: 'SYSTEM',
        symbol: tradeSymbol,
        contract: cfg.contract,
        stake: cStake,
        martingaleStep: mStep,
        exitDigit: '-',
        result: 'Failed',
        pnl: 0,
        balance: currentBalance,
        switchInfo: `❌ Insufficient balance! Required: $${cStake.toFixed(2)}, Available: $${currentBalance.toFixed(2)}`,
      });
      return { localPnl: currentPnl, localBalance: currentBalance, cStake, mStep, inRecovery: mkt === 2, shouldBreak: false, won: false, contractExecuted: false };
    }
    
    const logId = addLog({
      time: new Date().toLocaleTimeString(),
      market: mkt === 1 ? 'M1' : 'M2',
      symbol: tradeSymbol,
      contract: cfg.contract,
      stake: cStake,
      martingaleStep: mStep,
      exitDigit: '...',
      result: 'Pending',
      pnl: 0,
      balance: currentBalance,
      switchInfo: '',
    });
    
    setTotalStaked(prev => prev + cStake);
    setCurrentStakeState(cStake);
    
    let updatedBalance = currentBalance;
    let updatedPnl = currentPnl;
    let won = false;
    let contractExecuted = false;
    let inRecovery = mkt === 2;
    let newCStake = cStake;
    let newMStep = mStep;
    
    try {
      if (!turboMode) await waitForNextTick(tradeSymbol);
      
      const buyParams: any = {
        contract_type: cfg.contract,
        symbol: tradeSymbol,
        duration: 1,
        duration_unit: 't',
        basis: 'stake',
        amount: cStake,
      };
      if (needsBarrier(cfg.contract)) buyParams.barrier = cfg.barrier;
      
      const buyResponse = await derivApi.buyContract(buyParams);
      if (!buyResponse?.contractId) throw new Error('Contract purchase failed');
      contractExecuted = true;
      
      if (copyTradingService.enabled) {
        copyTradingService.copyTrade({ ...buyParams, masterTradeId: buyResponse.contractId }).catch(console.error);
      }
      
      const result = await derivApi.waitForContractResult(buyResponse.contractId);
      won = result.status === 'won';
      const pnl = result.profit;
      
      updatedPnl = currentPnl + pnl;
      updatedBalance = currentBalance + pnl;
      setLocalBalance(updatedBalance);
      setNetProfit(updatedPnl);
      
      const exitDigit = String(getLastDigit(result.sellPrice || 0));
      let switchInfo = '';
      
      if (won) {
        setWins(prev => prev + 1);
        if (inRecovery) { switchInfo = '✓ Recovery WIN → Back to M1'; inRecovery = false; }
        else { switchInfo = '→ Continue M1'; }
        newMStep = 0;
        newCStake = baseStake;
      } else {
        setLosses(prev => prev + 1);
        if (activeAccount?.is_virtual) recordLoss(cStake, tradeSymbol, 6000);
        if (!inRecovery && m2Enabled) { inRecovery = true; switchInfo = '✗ Loss → Switch to M2 (Recovery)'; }
        else { switchInfo = inRecovery ? '→ Stay M2' : '→ Continue M1'; }
        if (martingaleOn) {
          const maxS = parseInt(martingaleMaxSteps) || 5;
          if (mStep < maxS) {
            newCStake = parseFloat((cStake * (parseFloat(martingaleMultiplier) || 2)).toFixed(2));
            newMStep++;
          } else { newMStep = 0; newCStake = baseStake; }
        }
      }
      
      setMartingaleStepState(newMStep);
      setCurrentStakeState(newCStake);
      
      updateLog(logId, { exitDigit, result: won ? 'Win' : 'Loss', pnl, balance: updatedBalance, switchInfo });
      
      let shouldBreak = false;
      const tpValue = parseFloat(takeProfit);
      const slValue = parseFloat(stopLoss);
      
      if (updatedPnl >= tpValue) {
        showTPNotification('tp', `Take Profit Target Hit!`, updatedPnl);
        shouldBreak = true;
        shouldStopRef.current = true;
      }
      if (updatedPnl <= -slValue) {
        showTPNotification('sl', `Stop Loss Target Hit!`, Math.abs(updatedPnl));
        shouldBreak = true;
        shouldStopRef.current = true;
      }
      
      return { localPnl: updatedPnl, localBalance: updatedBalance, cStake: newCStake, mStep: newMStep, inRecovery, shouldBreak, won, contractExecuted: true };
    } catch (err: any) {
      updateLog(logId, { result: 'Failed', exitDigit: '-', switchInfo: `❌ Trade failed: ${err.message}` });
      if (!turboMode) await new Promise(r => setTimeout(r, 2000));
      return { localPnl: updatedPnl, localBalance: updatedBalance, cStake: newCStake, mStep: newMStep, inRecovery, shouldBreak: false, won: false, contractExecuted: false };
    }
  }, [addLog, updateLog, m2Enabled, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, turboMode, ensureConnection, activeAccount, recordLoss]);
  
  // ========== START BOT ==========
  const startBot = useCallback(async () => {
    if (!isAuthorized || isRunning) return;
    
    const connected = await ensureConnection();
    if (!connected) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'CONNECTION', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ Failed to connect to Deriv' });
      return;
    }
    
    const baseStake = parseFloat(stake);
    if (baseStake < 0.35) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'STAKE', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ Minimum stake is $0.35' });
      return;
    }
    if (!m1Enabled && !m2Enabled) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'CONFIG', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ Both M1 and M2 are disabled' });
      return;
    }
    if (m1StrategyEnabled && m1StrategyMode === 'pattern' && !m1PatternValid) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'STRATEGY', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ M1 pattern invalid (min 2 chars, E/O only)' });
      return;
    }
    if (m2StrategyEnabled && m2StrategyMode === 'pattern' && !m2PatternValid) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'STRATEGY', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ M2 pattern invalid' });
      return;
    }
    
    if (authBalance < baseStake) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'BALANCE', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: `❌ Insufficient balance! Required: $${baseStake.toFixed(2)}` });
      return;
    }
    
    shouldStopRef.current = false;
    setIsRunning(true);
    runningRef.current = true;
    setBotStatus('trading_m1');
    setCurrentMarket(1);
    setCurrentStakeState(baseStake);
    setMartingaleStepState(0);
    patternTradeTakenRef.current = false;
    combinedTradeTakenRef.current = false;
    
    let cStake = baseStake;
    let mStep = 0;
    let inRecovery = false;
    let currentPnl = 0;
    let currentBalance = authBalance;
    
    while (runningRef.current && !shouldStopRef.current) {
      // Check TP/SL
      if (currentPnl >= parseFloat(takeProfit) || currentPnl <= -parseFloat(stopLoss)) {
        shouldStopRef.current = true;
        break;
      }
      
      // Check connection
      if (!derivApi.isConnected) {
        setBotStatus('reconnecting');
        const reconnected = await ensureConnection();
        if (!reconnected) break;
        setBotStatus(inRecovery ? 'recovery' : 'trading_m1');
      }
      
      const mkt: 1 | 2 = inRecovery ? 2 : 1;
      setCurrentMarket(mkt);
      
      if (mkt === 1 && !m1Enabled) { if (m2Enabled) { inRecovery = true; continue; } else break; }
      if (mkt === 2 && !m2Enabled) { inRecovery = false; continue; }
      
      const cfg = mkt === 1 
        ? { contract: m1Contract, barrier: m1Barrier, symbol: m1Symbol }
        : { contract: m2Contract, barrier: m2Barrier, symbol: m2Symbol };
      const hookEnabled = mkt === 1 ? m1HookEnabled : m2HookEnabled;
      const requiredLosses = parseInt(mkt === 1 ? m1VirtualLossCount : m2VirtualLossCount) || 3;
      const realCount = parseInt(mkt === 1 ? m1RealCount : m2RealCount) || 2;
      const strategyActive = mkt === 1 ? m1StrategyEnabled : m2StrategyEnabled;
      const combinedActive = mkt === 1 ? m1CombinedEnabled : m2CombinedEnabled;
      const combinedPatterns = mkt === 1 ? m1CombinedPatterns : m2CombinedPatterns;
      
      let tradeSymbol = cfg.symbol;
      let patternMatched = false;
      
      // Combined strategy check (highest priority)
      if (combinedActive && combinedPatterns.trim() !== '') {
        setBotStatus('waiting_pattern');
        let matched = false;
        let attempts = 0;
        while (runningRef.current && !matched && attempts < 100 && !shouldStopRef.current) {
          if (checkCombinedForSymbol(tradeSymbol, combinedPatterns)) { matched = true; }
          if (!matched) {
            if (turboMode) await new Promise(r => requestAnimationFrame(r));
            else await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
        }
        if (matched && runningRef.current && !shouldStopRef.current) {
          setBotStatus('pattern_matched');
          if (!turboMode) await new Promise(r => setTimeout(r, 300));
          addLog({ time: new Date().toLocaleTimeString(), market: 'COMBINED', symbol: tradeSymbol, contract: cfg.contract, stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Pending', pnl: 0, balance: currentBalance, switchInfo: `🎯 COMBINED PATTERN MATCHED! ${combinedPatterns}` });
          combinedTradeTakenRef.current = true;
          patternMatched = true;
        }
      }
      
      // Regular strategy check (if no combined match)
      if (!patternMatched && strategyActive) {
        setBotStatus('waiting_pattern');
        let matched = false;
        let attempts = 0;
        while (runningRef.current && !matched && attempts < 100 && !shouldStopRef.current) {
          if (checkStrategyForMarket(mkt, tradeSymbol)) { matched = true; }
          if (!matched) {
            if (turboMode) await new Promise(r => requestAnimationFrame(r));
            else await new Promise(r => setTimeout(r, 100));
            attempts++;
          }
        }
        if (matched && runningRef.current && !shouldStopRef.current) {
          setBotStatus('pattern_matched');
          if (!turboMode) await new Promise(r => setTimeout(r, 300));
          patternTradeTakenRef.current = true;
        } else if (!matched) { continue; }
      }
      
      // Execute trade or virtual hook
      if (hookEnabled && !patternMatched) {
        setBotStatus('virtual_hook');
        setVhStatus('waiting');
        setVhFakeWins(0);
        setVhFakeLosses(0);
        setVhConsecLosses(0);
        let consecLosses = 0;
        let virtualNum = 0;
        
        while (consecLosses < requiredLosses && runningRef.current && !shouldStopRef.current) {
          virtualNum++;
          const vLogId = addLog({ time: new Date().toLocaleTimeString(), market: 'VH', symbol: tradeSymbol, contract: cfg.contract, stake: 0, martingaleStep: 0, exitDigit: '...', result: 'Pending', pnl: 0, balance: currentBalance, switchInfo: `Virtual #${virtualNum} (losses: ${consecLosses}/${requiredLosses})` });
          
          try {
            const vResult = await simulateVirtualContract(cfg.contract, cfg.barrier, tradeSymbol);
            if (!runningRef.current || shouldStopRef.current) break;
            if (vResult.won) {
              consecLosses = 0;
              setVhConsecLosses(0);
              setVhFakeWins(prev => prev + 1);
              updateLog(vLogId, { exitDigit: String(vResult.digit), result: 'V-Win', switchInfo: `Virtual WIN → Losses reset` });
            } else {
              consecLosses++;
              setVhConsecLosses(consecLosses);
              setVhFakeLosses(prev => prev + 1);
              updateLog(vLogId, { exitDigit: String(vResult.digit), result: 'V-Loss', switchInfo: `Virtual LOSS (${consecLosses}/${requiredLosses})` });
            }
          } catch (err) {
            updateLog(vLogId, { result: 'V-Loss', exitDigit: '-', switchInfo: `Error: ${err}` });
            break;
          }
        }
        
        if (!runningRef.current || shouldStopRef.current) break;
        setVhStatus('confirmed');
        
        for (let ri = 0; ri < realCount && runningRef.current && !shouldStopRef.current; ri++) {
          const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalance, currentPnl, baseStake);
          if (!result.contractExecuted) continue;
          currentPnl = result.localPnl;
          currentBalance = result.localBalance;
          cStake = result.cStake;
          mStep = result.mStep;
          inRecovery = result.inRecovery;
          if (result.shouldBreak) { shouldStopRef.current = true; break; }
          if (result.won) break;
        }
        setVhStatus('idle');
        setVhConsecLosses(0);
        if (strategyActive) patternTradeTakenRef.current = true;
        if (!turboMode) await new Promise(r => setTimeout(r, 400));
        continue;
      }
      
      // Normal trade execution
      const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalance, currentPnl, baseStake);
      if (!result.contractExecuted) continue;
      
      currentPnl = result.localPnl;
      currentBalance = result.localBalance;
      cStake = result.cStake;
      mStep = result.mStep;
      inRecovery = result.inRecovery;
      
      if (result.shouldBreak) { shouldStopRef.current = true; break; }
      if (strategyActive) patternTradeTakenRef.current = true;
      if (!turboMode) await new Promise(r => setTimeout(r, 400));
    }
    
    setIsRunning(false);
    runningRef.current = false;
    setBotStatus('idle');
    shouldStopRef.current = false;
  }, [isAuthorized, isRunning, stake, m1Enabled, m2Enabled, m1Contract, m2Contract, m1Barrier, m2Barrier, m1Symbol, m2Symbol, m1HookEnabled, m2HookEnabled, m1VirtualLossCount, m2VirtualLossCount, m1RealCount, m2RealCount, m1StrategyEnabled, m2StrategyEnabled, m1StrategyMode, m2StrategyMode, m1PatternValid, m2PatternValid, m1CombinedEnabled, m2CombinedEnabled, m1CombinedPatterns, m2CombinedPatterns, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, turboMode, authBalance, addLog, ensureConnection, checkStrategyForMarket, checkCombinedForSymbol, executeRealTrade]);
  
  const stopBot = useCallback(() => {
    shouldStopRef.current = true;
    runningRef.current = false;
    setIsRunning(false);
    setBotStatus('idle');
    patternTradeTakenRef.current = false;
    combinedTradeTakenRef.current = false;
    toast.info('🛑 Bot stopped manually');
  }, []);
  
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
  const statusConfig: Record<BotStatus, { icon: string; label: string; color: string }> = {
    idle: { icon: '⚪', label: 'IDLE', color: 'text-muted-foreground' },
    trading_m1: { icon: '🟢', label: 'TRADING M1', color: 'text-profit' },
    recovery: { icon: '🟣', label: 'RECOVERY MODE', color: 'text-purple-400' },
    waiting_pattern: { icon: '🟡', label: 'WAITING PATTERN', color: 'text-warning' },
    pattern_matched: { icon: '✅', label: 'PATTERN MATCHED', color: 'text-profit' },
    virtual_hook: { icon: '🎣', label: 'VIRTUAL HOOK', color: 'text-primary' },
    reconnecting: { icon: '🔄', label: 'RECONNECTING...', color: 'text-orange-400' },
  };
  const status = statusConfig[botStatus];
  
  // Live digits for current market
  const activeSymbol = currentMarket === 1 ? m1Symbol : m2Symbol;
  const activeDigits = (tickMapRef.current.get(activeSymbol) || []).slice(-12);
  
  return (
    <>
      <style>{notificationStyles}</style>
      <TPSLNotificationPopup />
      
      <div className="space-y-3 max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-card/80 to-card/50 backdrop-blur-sm border border-blue-500/20 rounded-xl px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-md">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">Ramzfx Speed Bot</h1>
              <p className="text-[10px] text-blue-300/80">Dual Market Trading System with Recovery</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[9px] ${derivApi.isConnected ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>
              {derivApi.isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span>{derivApi.isConnected ? 'Connected' : 'Offline'}</span>
            </div>
            <Badge className={`${status.color} text-[9px] px-2 py-0.5 bg-muted/50 border-blue-500/20`}>
              {status.icon} {status.label}
            </Badge>
            {isRunning && (
              <Badge variant="outline" className="text-[9px] text-warning animate-pulse font-mono border-yellow-500/30">
                P/L: ${netProfit.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Live Digits Display */}
        <div className="bg-card border border-blue-500/20 rounded-xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-blue-400 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> Live Market Data — {activeSymbol}
            </h3>
            <span className="text-[9px] text-muted-foreground font-mono">Win Rate: {winRate}% | Staked: ${totalStaked.toFixed(2)}</span>
          </div>
          <div className="flex gap-1 justify-center flex-wrap">
            {activeDigits.length === 0 ? (
              <span className="text-[10px] text-muted-foreground">Waiting for ticks...</span>
            ) : activeDigits.map((d, i) => {
              const isOver = d >= 5;
              const isEven = d % 2 === 0;
              const isLast = i === activeDigits.length - 1;
              return (
                <motion.div
                  key={i}
                  initial={isLast ? { scale: 0.8 } : {}}
                  animate={isLast ? { scale: [1, 1.2, 1] } : {}}
                  transition={isLast ? { duration: 0.3 } : {}}
                  className={`w-10 h-12 rounded-lg flex flex-col items-center justify-center text-sm font-mono font-bold border-2 ${
                    isLast ? 'ring-2 ring-blue-500 shadow-lg border-blue-500' : 'border-border'
                  } ${isOver ? 'bg-loss/10 border-loss/30 text-loss' : 'bg-profit/10 border-profit/30 text-profit'}`}
                >
                  <span className="text-base">{d}</span>
                  <span className="text-[7px] opacity-60">{isOver ? 'OVER' : 'UNDER'}{isEven ? '✓' : '✗'}</span>
                </motion.div>
              );
            })}
          </div>
          <div className="text-center text-[8px] text-muted-foreground mt-2">
            🔄 Updates in real-time with each new tick | Using last digit after decimal
          </div>
        </div>
        
        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* LEFT: Configuration Column */}
          <div className="lg:col-span-5 space-y-3">
            {/* Market 1 Card */}
            <div className="bg-card border-2 border-blue-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-blue-400 flex items-center gap-1"><Home className="w-3.5 h-3.5" /> Market 1 (Primary)</h3>
                <div className="flex items-center gap-1.5">
                  {currentMarket === 1 && isRunning && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                  <Switch checked={m1Enabled} onCheckedChange={setM1Enabled} disabled={isRunning} />
                </div>
              </div>
              <Select value={m1Symbol} onValueChange={setM1Symbol} disabled={isRunning}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_MARKETS.map(m => <SelectItem key={m.symbol} value={m.symbol}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={m1Contract} onValueChange={setM1Contract} disabled={isRunning}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRACT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {needsBarrier(m1Contract) && (
                <Input type="number" min="0" max="9" value={m1Barrier} onChange={e => setM1Barrier(e.target.value)} className="h-7 text-xs" disabled={isRunning} placeholder="Barrier digit" />
              )}
              
              {/* M1 Virtual Hook */}
              <div className="border-t border-border/30 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Anchor className="w-3 h-3" /> Virtual Hook</span>
                  <Switch checked={m1HookEnabled} onCheckedChange={setM1HookEnabled} disabled={isRunning} />
                </div>
                {m1HookEnabled && (
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <div><label className="text-[8px] text-muted-foreground">Required Losses</label><Input type="number" min="1" max="20" value={m1VirtualLossCount} onChange={e => setM1VirtualLossCount(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" /></div>
                    <div><label className="text-[8px] text-muted-foreground">Real Trades</label><Input type="number" min="1" max="10" value={m1RealCount} onChange={e => setM1RealCount(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" /></div>
                  </div>
                )}
              </div>
              
              {/* M1 Combined Strategy */}
              <div className="border-t border-border/30 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-green-400 flex items-center gap-1"><Combine className="w-3 h-3" /> Combined Strategy</span>
                  <Switch checked={m1CombinedEnabled} onCheckedChange={setM1CombinedEnabled} disabled={isRunning} />
                </div>
                {m1CombinedEnabled && (
                  <Textarea placeholder="Patterns: 1,5,11,112,1O,5U,3E,EEO,OOE (comma separated)" value={m1CombinedPatterns} onChange={e => setM1CombinedPatterns(e.target.value)} disabled={isRunning} className="h-16 text-[10px] font-mono mt-1" />
                )}
              </div>
              
              {/* M1 Regular Strategy */}
              <div className="border-t border-border/30 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-yellow-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Pattern Strategy</span>
                  <Switch checked={m1StrategyEnabled} onCheckedChange={setM1StrategyEnabled} disabled={isRunning} />
                </div>
                {m1StrategyEnabled && (
                  <div className="space-y-2 mt-1">
                    <div className="flex gap-1">
                      <Button size="sm" variant={m1StrategyMode === 'pattern' ? 'default' : 'outline'} className="text-[9px] h-5 px-2 flex-1" onClick={() => setM1StrategyMode('pattern')} disabled={isRunning}>E/O Pattern</Button>
                      <Button size="sm" variant={m1StrategyMode === 'digit' ? 'default' : 'outline'} className="text-[9px] h-5 px-2 flex-1" onClick={() => setM1StrategyMode('digit')} disabled={isRunning}>Digit Condition</Button>
                    </div>
                    {m1StrategyMode === 'pattern' ? (
                      <>
                        <Textarea placeholder="E=Even, O=Odd (e.g., EEEOE)" value={m1Pattern} onChange={e => setM1Pattern(e.target.value.toUpperCase().replace(/[^EO]/g, ''))} disabled={isRunning} className="h-12 text-[10px] font-mono" />
                        <div className={`text-[9px] font-mono ${m1PatternValid ? 'text-profit' : 'text-loss'}`}>{m1PatternValid ? `✓ Pattern: ${cleanM1Pattern}` : '✗ Need 2+ characters (E/O)'}</div>
                      </>
                    ) : (
                      <div className="grid grid-cols-3 gap-1">
                        <Input type="number" min="1" max="50" value={m1DigitWindow} onChange={e => setM1DigitWindow(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" placeholder="Window" />
                        <Select value={m1DigitCondition} onValueChange={setM1DigitCondition} disabled={isRunning}>
                          <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{['==', '>', '<', '>=', '<='].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" min="0" max="9" value={m1DigitCompare} onChange={e => setM1DigitCompare(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" placeholder="Digit" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Market 2 Card (Recovery) */}
            <div className="bg-card border-2 border-purple-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-purple-400 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Market 2 (Recovery)</h3>
                <div className="flex items-center gap-1.5">
                  {currentMarket === 2 && isRunning && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
                  <Switch checked={m2Enabled} onCheckedChange={setM2Enabled} disabled={isRunning} />
                </div>
              </div>
              <Select value={m2Symbol} onValueChange={setM2Symbol} disabled={isRunning}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_MARKETS.map(m => <SelectItem key={m.symbol} value={m.symbol}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={m2Contract} onValueChange={setM2Contract} disabled={isRunning}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTRACT_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
              {needsBarrier(m2Contract) && (
                <Input type="number" min="0" max="9" value={m2Barrier} onChange={e => setM2Barrier(e.target.value)} className="h-7 text-xs" disabled={isRunning} placeholder="Barrier digit" />
              )}
              
              {/* M2 Virtual Hook */}
              <div className="border-t border-border/30 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Anchor className="w-3 h-3" /> Virtual Hook</span>
                  <Switch checked={m2HookEnabled} onCheckedChange={setM2HookEnabled} disabled={isRunning} />
                </div>
                {m2HookEnabled && (
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <div><label className="text-[8px] text-muted-foreground">Required Losses</label><Input type="number" min="1" max="20" value={m2VirtualLossCount} onChange={e => setM2VirtualLossCount(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" /></div>
                    <div><label className="text-[8px] text-muted-foreground">Real Trades</label><Input type="number" min="1" max="10" value={m2RealCount} onChange={e => setM2RealCount(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" /></div>
                  </div>
                )}
              </div>
              
              {/* M2 Combined Strategy */}
              <div className="border-t border-border/30 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-green-400 flex items-center gap-1"><Combine className="w-3 h-3" /> Combined Strategy</span>
                  <Switch checked={m2CombinedEnabled} onCheckedChange={setM2CombinedEnabled} disabled={isRunning} />
                </div>
                {m2CombinedEnabled && (
                  <Textarea placeholder="Patterns: 1,5,11,112,1O,5U,3E,EEO,OOE (comma separated)" value={m2CombinedPatterns} onChange={e => setM2CombinedPatterns(e.target.value)} disabled={isRunning} className="h-16 text-[10px] font-mono mt-1" />
                )}
              </div>
              
              {/* M2 Regular Strategy */}
              <div className="border-t border-border/30 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-yellow-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Pattern Strategy</span>
                  <Switch checked={m2StrategyEnabled} onCheckedChange={setM2StrategyEnabled} disabled={isRunning} />
                </div>
                {m2StrategyEnabled && (
                  <div className="space-y-2 mt-1">
                    <div className="flex gap-1">
                      <Button size="sm" variant={m2StrategyMode === 'pattern' ? 'default' : 'outline'} className="text-[9px] h-5 px-2 flex-1" onClick={() => setM2StrategyMode('pattern')} disabled={isRunning}>E/O Pattern</Button>
                      <Button size="sm" variant={m2StrategyMode === 'digit' ? 'default' : 'outline'} className="text-[9px] h-5 px-2 flex-1" onClick={() => setM2StrategyMode('digit')} disabled={isRunning}>Digit Condition</Button>
                    </div>
                    {m2StrategyMode === 'pattern' ? (
                      <>
                        <Textarea placeholder="E=Even, O=Odd (e.g., OOEEO)" value={m2Pattern} onChange={e => setM2Pattern(e.target.value.toUpperCase().replace(/[^EO]/g, ''))} disabled={isRunning} className="h-12 text-[10px] font-mono" />
                        <div className={`text-[9px] font-mono ${m2PatternValid ? 'text-profit' : 'text-loss'}`}>{m2PatternValid ? `✓ Pattern: ${cleanM2Pattern}` : '✗ Need 2+ characters (E/O)'}</div>
                      </>
                    ) : (
                      <div className="grid grid-cols-3 gap-1">
                        <Input type="number" min="1" max="50" value={m2DigitWindow} onChange={e => setM2DigitWindow(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" placeholder="Window" />
                        <Select value={m2DigitCondition} onValueChange={setM2DigitCondition} disabled={isRunning}>
                          <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>{['==', '>', '<', '>=', '<='].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input type="number" min="0" max="9" value={m2DigitCompare} onChange={e => setM2DigitCompare(e.target.value)} disabled={isRunning} className="h-6 text-[10px]" placeholder="Digit" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Risk Management */}
            <div className="bg-card border border-blue-500/20 rounded-xl p-3 space-y-2">
              <h3 className="text-xs font-semibold flex items-center gap-1"><Shield className="w-3.5 h-3.5" /> Risk Management</h3>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-[8px] text-muted-foreground">Stake ($)</label><Input type="number" min="0.35" step="0.01" value={stake} onChange={e => setStake(e.target.value)} disabled={isRunning} className="h-7 text-xs" /></div>
                <div><label className="text-[8px] text-muted-foreground">Take Profit</label><Input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={isRunning} className="h-7 text-xs" /></div>
                <div><label className="text-[8px] text-muted-foreground">Stop Loss</label><Input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={isRunning} className="h-7 text-xs" /></div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[10px]">Martingale</label>
                <Switch checked={martingaleOn} onCheckedChange={setMartingaleOn} disabled={isRunning} />
              </div>
              {martingaleOn && (
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[8px] text-muted-foreground">Multiplier</label><Input type="number" min="1.1" step="0.1" value={martingaleMultiplier} onChange={e => setMartingaleMultiplier(e.target.value)} disabled={isRunning} className="h-7 text-xs" /></div>
                  <div><label className="text-[8px] text-muted-foreground">Max Steps</label><Input type="number" min="1" max="10" value={martingaleMaxSteps} onChange={e => setMartingaleMaxSteps(e.target.value)} disabled={isRunning} className="h-7 text-xs" /></div>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <Zap className={`w-3.5 h-3.5 ${turboMode ? 'text-blue-400 animate-pulse' : 'text-muted-foreground'}`} />
                  <span className="text-[10px]">Turbo Mode</span>
                </div>
                <Button size="sm" variant={turboMode ? 'default' : 'outline'} className={`h-6 text-[9px] px-2 ${turboMode ? 'bg-blue-500 text-white animate-pulse' : ''}`} onClick={() => setTurboMode(!turboMode)} disabled={isRunning}>
                  {turboMode ? '⚡ ON' : 'OFF'}
                </Button>
              </div>
            </div>
          </div>
          
          {/* RIGHT: Status & Activity Log */}
          <div className="lg:col-span-7 space-y-3">
            {/* Live Status Dashboard */}
            <div className="bg-card border border-blue-500/20 rounded-xl p-3 shadow-md">
              <h3 className="text-xs font-semibold flex items-center gap-2 mb-2"><Trophy className="w-3.5 h-3.5 text-blue-400" /> Live Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Status</div><div className={`text-[11px] font-bold ${status.color}`}>{status.icon} {status.label}</div></div>
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Active Market</div><div className={`text-[11px] font-bold ${currentMarket === 1 ? 'text-blue-400' : 'text-purple-400'}`}>{currentMarket === 1 ? 'M1 (Primary)' : 'M2 (Recovery)'}</div></div>
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Win Rate</div><div className="text-[11px] font-bold font-mono text-blue-400">{winRate}%</div></div>
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Current P/L</div><div className={`text-[11px] font-bold font-mono ${netProfit >= 0 ? 'text-profit' : 'text-loss'}`}>${netProfit.toFixed(2)}</div></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Current Stake</div><div className="text-[11px] font-bold font-mono">${currentStake.toFixed(2)}{martingaleStep > 0 && <span className="text-warning ml-1">M{martingaleStep}</span>}</div></div>
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Balance</div><div className="text-[11px] font-bold font-mono text-blue-400">${localBalance.toFixed(2)}</div></div>
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">Total Staked</div><div className="text-[11px] font-bold font-mono">${totalStaked.toFixed(2)}</div></div>
                <div className="bg-muted/40 rounded-lg p-2 text-center"><div className="text-[8px] text-muted-foreground">W/L</div><div className="text-[11px] font-bold font-mono"><span className="text-profit">{wins}</span>/<span className="text-loss">{losses}</span></div></div>
              </div>
              {vhStatus === 'waiting' && (
                <div className="mt-2 text-center bg-blue-500/10 border border-blue-500/30 rounded-lg p-1.5"><div className="text-[9px] text-blue-400 animate-pulse flex items-center justify-center gap-2"><Anchor className="w-3 h-3" /> Virtual Hook Active — Waiting for losses... ({vhConsecLosses}/{currentMarket === 1 ? m1VirtualLossCount : m2VirtualLossCount})</div></div>
              )}
              {(botStatus === 'waiting_pattern' && (m1StrategyEnabled || m2StrategyEnabled || m1CombinedEnabled || m2CombinedEnabled)) && (
                <div className="mt-2 text-center bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-1.5"><div className="text-[9px] text-yellow-500 animate-pulse flex items-center justify-center gap-2"><Eye className="w-3 h-3" /> Scanning for pattern match...</div></div>
              )}
            </div>
            
            {/* Start/Stop Button */}
            <button
              onClick={isRunning ? stopBot : startBot}
              disabled={(!isRunning && (!isAuthorized || localBalance < parseFloat(stake) || (!isConnected && !isRunning)))}
              className={`relative w-full h-16 text-lg font-bold rounded-xl transition-all duration-300 ease-out overflow-hidden group ${isRunning ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/30 animate-glow-pulse' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30'} disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transform`}
            >
              {isRunning && <><span className="absolute inset-0 bg-white/20 animate-pulse rounded-xl" /><span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" /></>}
              <div className="relative flex items-center justify-center gap-3">
                {isRunning ? <><StopCircle className="w-6 h-6 animate-pulse" /> STOP BOT</> : <><Play className="w-6 h-6 transition-transform group-hover:scale-110" /> START BOT</>}
              </div>
            </button>
            
            {/* Activity Log */}
            <div className="bg-card border border-blue-500/20 rounded-xl overflow-hidden shadow-lg">
              <div className="px-4 py-3 border-b border-blue-500/20 flex items-center justify-between gap-3 bg-muted/20">
                <h3 className="text-xs font-semibold flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 text-blue-400" /> Activity Log <Badge variant="outline" className="text-[9px] bg-blue-500/10 border-blue-500/30 text-blue-400">{logEntries.length}</Badge></h3>
                <Button variant="ghost" size="sm" onClick={clearLog} className="h-7 w-7 p-0 text-muted-foreground hover:text-loss"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full text-[10px]">
                  <thead className="text-[9px] text-muted-foreground bg-muted/40 sticky top-0">
                    <tr className="border-b border-blue-500/20"><th className="text-left p-2">Time</th><th className="text-left p-2">Mkt</th><th className="text-left p-2">Symbol</th><th className="text-left p-2">Type</th><th className="text-right p-2">Stake</th><th className="text-center p-2">Digit</th><th className="text-center p-2">Result</th><th className="text-right p-2">P/L</th><th className="text-right p-2">Bal</th></tr>
                  </thead>
                  <tbody>
                    {logEntries.length === 0 ? (
                      <tr><td colSpan={9} className="text-center text-muted-foreground py-12"><Zap className="w-8 h-8 mx-auto mb-2 text-muted-foreground/30" />No trades yet</td></tr>
                    ) : logEntries.map(e => (
                      <tr key={e.id} className={`border-b border-border/50 hover:bg-muted/30 ${e.market === 'M1' ? 'border-l-2 border-l-blue-500' : e.market === 'VH' ? 'border-l-2 border-l-indigo-500' : e.market === 'COMBINED' ? 'border-l-2 border-l-green-500' : e.market === 'SYSTEM' ? 'border-l-2 border-l-orange-500' : 'border-l-2 border-l-purple-500'}`}>
                        <td className="p-2 font-mono text-[9px] text-muted-foreground">{e.time}</td>
                        <td className={`p-2 font-bold text-[10px] ${e.market === 'M1' ? 'text-blue-400' : e.market === 'VH' ? 'text-indigo-400' : e.market === 'COMBINED' ? 'text-green-400' : e.market === 'SYSTEM' ? 'text-orange-500' : 'text-purple-400'}`}>{e.market}</td>
                        <td className="p-2 font-mono text-[9px]">{e.symbol}</td>
                        <td className="p-2 text-[9px] text-muted-foreground">{e.contract.replace('DIGIT', '')}</td>
                        <td className="p-2 font-mono text-right text-[9px]">{e.market === 'VH' ? <span className="text-indigo-400">FAKE</span> : e.market === 'SYSTEM' ? <span className="text-orange-500">SYS</span> : e.market === 'COMBINED' ? <span className="text-green-400">CMD</span> : <span>${e.stake.toFixed(2)}</span>}{e.martingaleStep > 0 && e.market !== 'VH' && e.market !== 'SYSTEM' && e.market !== 'COMBINED' && <span className="text-warning ml-1">M{e.martingaleStep}</span>}</td>
                        <td className="p-2 text-center font-mono text-[10px] font-bold">{e.exitDigit}</td>
                        <td className="p-2 text-center"><span className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${e.result === 'Win' || e.result === 'V-Win' ? 'bg-profit/20 text-profit' : e.result === 'Loss' || e.result === 'V-Loss' ? 'bg-loss/20 text-loss' : e.result === 'Failed' ? 'bg-orange-500/20 text-orange-500' : 'bg-warning/20 text-warning animate-pulse'}`}>{e.result === 'Pending' ? '...' : e.result === 'V-Win' ? '✓' : e.result === 'V-Loss' ? '✗' : e.result === 'Failed' ? '⚠️' : e.result}</span></td>
                        <td className={`p-2 font-mono text-right text-[9px] font-bold ${e.pnl > 0 ? 'text-profit' : e.pnl < 0 ? 'text-loss' : 'text-muted-foreground'}`}>{e.result === 'Pending' ? '...' : e.market === 'VH' || e.market === 'SYSTEM' || e.result === 'Failed' ? '-' : `${e.pnl > 0 ? '+' : ''}${e.pnl.toFixed(2)}`}</td>
                        <td className="p-2 font-mono text-right text-[9px] text-muted-foreground">{e.market === 'VH' || e.market === 'SYSTEM' || e.result === 'Failed' ? '-' : `$${e.balance.toFixed(2)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
