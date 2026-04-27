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
  TrendingUp, TrendingDown, BarChart3, Volume2, VolumeX, Wifi, WifiOff, GripVertical, Combine, Sparkles, ChevronDown, ChevronUp
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

type BotStatus = 'idle' | 'trading_m1' | 'recovery' | 'waiting_pattern' | 'pattern_matched' | 'virtual_hook' | 'reconnecting' | 'insufficient_funds';

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

const showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
  if (typeof window !== 'undefined' && (window as any).showTPNotification) {
    (window as any).showTPNotification(type, message, amount);
  }
};

const TPSLNotificationPopup = () => {
  const [notification, setNotification] = useState<{ type: 'tp' | 'sl'; message: string; amount?: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    (window as any).showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
      setNotification({ type, message, amount });
      setIsVisible(true);
      const timeout = setTimeout(() => setIsVisible(false), 5000);
      return () => clearTimeout(timeout);
    };
    return () => { delete (window as any).showTPNotification; };
  }, []);

  if (!isVisible || !notification) return null;

  const isTP = notification.type === 'tp';
  const amount = notification.amount;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-right duration-300">
      <div className={`rounded-lg shadow-xl overflow-hidden ${isTP ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' : 'bg-gradient-to-r from-rose-600 to-rose-500'}`}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${isTP ? 'bg-emerald-400/30' : 'bg-rose-400/30'}`}>
            {isTP ? '🎉' : '😢'}
          </div>
          <div className="flex-1">
            <p className="text-white text-xs font-medium">{notification.message}</p>
            {amount && <p className={`text-xs font-bold ${isTP ? 'text-emerald-200' : 'text-rose-200'}`}>{isTP ? '+' : '-'}${Math.abs(amount).toFixed(2)}</p>}
          </div>
          <button onClick={() => setIsVisible(false)} className="text-white/70 hover:text-white text-xs">OK</button>
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
      else { matched = false; break; }
    }
    if (matched) return true;
  }
  return false;
}

// Helper for non-blocking delays
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default function RamzfxSpeedBot() {
  const { isAuthorized, balance: authBalance, activeAccount, refreshBalance } = useAuth();
  const { recordLoss } = useLossRequirement();
  
  // UI State for collapsible sections
  const [expandedM1, setExpandedM1] = useState(false);
  const [expandedM2, setExpandedM2] = useState(false);
  
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
    setLogEntries(prev => [{ ...entry, id }, ...prev].slice(0, 50));
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
      await delay(2000);
      setIsConnected(derivApi.isConnected);
      return derivApi.isConnected;
    } catch (error) {
      setIsConnected(false);
      return false;
    }
  }, []);
  
  // ========== STRATEGY CHECKING (Non-blocking) ==========
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
  
  // Non-blocking pattern wait with proper cancellation
  const waitForPattern = useCallback(async (
    symbol: string,
    checkFn: () => boolean,
    timeoutMs: number = 30000
  ): Promise<boolean> => {
    const startTime = Date.now();
    while (runningRef.current && !shouldStopRef.current && (Date.now() - startTime) < timeoutMs) {
      if (checkFn()) {
        return true;
      }
      await delay(turboMode ? 50 : 100);
    }
    return false;
  }, [turboMode]);
  
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
    insufficientFunds: boolean;
  }> => {
    // Check balance FIRST before anything else
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
        switchInfo: `❌ INSUFFICIENT FUNDS! Required: $${cStake.toFixed(2)}, Available: $${currentBalance.toFixed(2)}. Bot stopping.`,
      });
      toast.error(`Insufficient funds! Need $${cStake.toFixed(2)} but have $${currentBalance.toFixed(2)}`);
      return { 
        localPnl: currentPnl, 
        localBalance: currentBalance, 
        cStake, 
        mStep, 
        inRecovery: mkt === 2, 
        shouldBreak: true, 
        won: false, 
        contractExecuted: false,
        insufficientFunds: true
      };
    }
    
    if (!derivApi.isConnected) {
      const connected = await ensureConnection();
      if (!connected) {
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
          switchInfo: `❌ No connection available`,
        });
        return { 
          localPnl: currentPnl, 
          localBalance: currentBalance, 
          cStake, 
          mStep, 
          inRecovery: mkt === 2, 
          shouldBreak: false, 
          won: false, 
          contractExecuted: false,
          insufficientFunds: false
        };
      }
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
      
      // Check if purchase was successful
      if (!buyResponse || !buyResponse.contractId) {
        throw new Error('Contract purchase failed - no contract ID returned');
      }
      
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
      
      // Refresh balance from auth context
      await refreshBalance();
      
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
          } else { 
            newMStep = 0; 
            newCStake = baseStake;
            switchInfo += ' (Martingale max steps reached, resetting)';
          }
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
      
      return { 
        localPnl: updatedPnl, 
        localBalance: updatedBalance, 
        cStake: newCStake, 
        mStep: newMStep, 
        inRecovery, 
        shouldBreak, 
        won, 
        contractExecuted: true,
        insufficientFunds: false
      };
    } catch (err: any) {
      console.error('Trade execution error:', err);
      updateLog(logId, { 
        result: 'Failed', 
        exitDigit: '-', 
        switchInfo: `❌ Trade failed: ${err.message || 'Unknown error'}` 
      });
      
      // Check if it's an insufficient funds error
      if (err.message && (err.message.includes('balance') || err.message.includes('funds') || err.message.includes('amount'))) {
        toast.error(`Insufficient funds! Balance: $${updatedBalance.toFixed(2)}`);
        return { 
          localPnl: updatedPnl, 
          localBalance: updatedBalance, 
          cStake: newCStake, 
          mStep: newMStep, 
          inRecovery, 
          shouldBreak: true, 
          won: false, 
          contractExecuted: false,
          insufficientFunds: true
        };
      }
      
      if (!turboMode) await delay(2000);
      return { 
        localPnl: updatedPnl, 
        localBalance: updatedBalance, 
        cStake: newCStake, 
        mStep: newMStep, 
        inRecovery, 
        shouldBreak: false, 
        won: false, 
        contractExecuted: false,
        insufficientFunds: false
      };
    }
  }, [addLog, updateLog, m2Enabled, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, turboMode, ensureConnection, activeAccount, recordLoss, refreshBalance]);
  
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
      toast.error('Minimum stake is $0.35');
      return;
    }
    if (!m1Enabled && !m2Enabled) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'CONFIG', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ Both M1 and M2 are disabled' });
      toast.error('Both markets are disabled');
      return;
    }
    if (m1StrategyEnabled && m1StrategyMode === 'pattern' && !m1PatternValid) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'STRATEGY', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ M1 pattern invalid (min 2 chars, E/O only)' });
      toast.error('Invalid M1 pattern');
      return;
    }
    if (m2StrategyEnabled && m2StrategyMode === 'pattern' && !m2PatternValid) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'STRATEGY', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: '❌ M2 pattern invalid' });
      toast.error('Invalid M2 pattern');
      return;
    }
    
    if (authBalance < baseStake) {
      addLog({ time: new Date().toLocaleTimeString(), market: 'SYSTEM', symbol: 'ERROR', contract: 'BALANCE', stake: 0, martingaleStep: 0, exitDigit: '-', result: 'Failed', pnl: 0, balance: authBalance, switchInfo: `❌ Insufficient balance! Required: $${baseStake.toFixed(2)}` });
      toast.error(`Insufficient balance! Need $${baseStake.toFixed(2)}`);
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
    
    addLog({
      time: new Date().toLocaleTimeString(),
      market: 'SYSTEM',
      symbol: 'BOT',
      contract: 'START',
      stake: baseStake,
      martingaleStep: 0,
      exitDigit: '-',
      result: 'Pending',
      pnl: 0,
      balance: currentBalance,
      switchInfo: `🚀 Bot started with stake $${baseStake.toFixed(2)} | TP: $${takeProfit} | SL: $${stopLoss}`,
    });
    
    while (runningRef.current && !shouldStopRef.current) {
      // Refresh balance periodically
      await refreshBalance();
      currentBalance = authBalance;
      setLocalBalance(currentBalance);
      
      // Check TP/SL
      if (currentPnl >= parseFloat(takeProfit) || currentPnl <= -parseFloat(stopLoss)) {
        shouldStopRef.current = true;
        break;
      }
      
      // Check for insufficient funds
      if (currentBalance < cStake) {
        addLog({
          time: new Date().toLocaleTimeString(),
          market: 'SYSTEM',
          symbol: 'BOT',
          contract: 'STOP',
          stake: cStake,
          martingaleStep: mStep,
          exitDigit: '-',
          result: 'Failed',
          pnl: currentPnl,
          balance: currentBalance,
          switchInfo: `❌ BOT STOPPED - Insufficient funds! Need $${cStake.toFixed(2)}, have $${currentBalance.toFixed(2)}`,
        });
        toast.error(`Bot stopped - Insufficient funds! Need $${cStake.toFixed(2)}`);
        setBotStatus('insufficient_funds');
        break;
      }
      
      // Check connection
      if (!derivApi.isConnected) {
        setBotStatus('reconnecting');
        const reconnected = await ensureConnection();
        if (!reconnected) {
          addLog({
            time: new Date().toLocaleTimeString(),
            market: 'SYSTEM',
            symbol: 'ERROR',
            contract: 'CONNECTION',
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Failed',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `❌ Connection lost, bot stopped`,
          });
          toast.error('Connection lost! Bot stopped.');
          break;
        }
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
        const matched = await waitForPattern(tradeSymbol, () => checkCombinedForSymbol(tradeSymbol, combinedPatterns), 30000);
        
        if (matched && runningRef.current && !shouldStopRef.current) {
          setBotStatus('pattern_matched');
          await delay(turboMode ? 100 : 300);
          addLog({ 
            time: new Date().toLocaleTimeString(), 
            market: 'COMBINED', 
            symbol: tradeSymbol, 
            contract: cfg.contract, 
            stake: 0, 
            martingaleStep: 0, 
            exitDigit: '-', 
            result: 'Pending', 
            pnl: 0, 
            balance: currentBalance, 
            switchInfo: `🎯 COMBINED PATTERN MATCHED! ${combinedPatterns}` 
          });
          combinedTradeTakenRef.current = true;
          patternMatched = true;
        } else if (!matched) {
          continue;
        }
      }
      
      // Regular strategy check (if no combined match)
      if (!patternMatched && strategyActive) {
        setBotStatus('waiting_pattern');
        let checkFn: () => boolean;
        
        if (mkt === 1) {
          if (m1StrategyMode === 'pattern') {
            checkFn = () => checkPatternMatch(tradeSymbol, cleanM1Pattern);
          } else {
            checkFn = () => checkDigitCondition(tradeSymbol, m1DigitCondition, m1DigitCompare, m1DigitWindow);
          }
        } else {
          if (m2StrategyMode === 'pattern') {
            checkFn = () => checkPatternMatch(tradeSymbol, cleanM2Pattern);
          } else {
            checkFn = () => checkDigitCondition(tradeSymbol, m2DigitCondition, m2DigitCompare, m2DigitWindow);
          }
        }
        
        const matched = await waitForPattern(tradeSymbol, checkFn, 30000);
        
        if (matched && runningRef.current && !shouldStopRef.current) {
          setBotStatus('pattern_matched');
          await delay(turboMode ? 100 : 300);
          patternTradeTakenRef.current = true;
        } else if (!matched) {
          continue;
        }
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
          const vLogId = addLog({ 
            time: new Date().toLocaleTimeString(), 
            market: 'VH', 
            symbol: tradeSymbol, 
            contract: cfg.contract, 
            stake: 0, 
            martingaleStep: 0, 
            exitDigit: '...', 
            result: 'Pending', 
            pnl: 0, 
            balance: currentBalance, 
            switchInfo: `Virtual #${virtualNum} (losses: ${consecLosses}/${requiredLosses})` 
          });
          
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
            await delay(100);
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
          
          if (result.insufficientFunds) {
            shouldStopRef.current = true;
            setBotStatus('insufficient_funds');
            break;
          }
          if (result.shouldBreak) { shouldStopRef.current = true; break; }
          if (result.won) break;
        }
        setVhStatus('idle');
        setVhConsecLosses(0);
        if (strategyActive) patternTradeTakenRef.current = true;
        await delay(turboMode ? 100 : 400);
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
      
      if (result.insufficientFunds) {
        shouldStopRef.current = true;
        setBotStatus('insufficient_funds');
        break;
      }
      if (result.shouldBreak) { shouldStopRef.current = true; break; }
      if (strategyActive) patternTradeTakenRef.current = true;
      await delay(turboMode ? 100 : 400);
    }
    
    setIsRunning(false);
    runningRef.current = false;
    if (shouldStopRef.current && botStatus !== 'insufficient_funds') {
      setBotStatus('idle');
      addLog({
        time: new Date().toLocaleTimeString(),
        market: 'SYSTEM',
        symbol: 'BOT',
        contract: 'STOP',
        stake: 0,
        martingaleStep: 0,
        exitDigit: '-',
        result: 'Pending',
        pnl: netProfit,
        balance: currentBalance,
        switchInfo: `🛑 Bot stopped. Final P/L: $${netProfit.toFixed(2)}`,
      });
      toast.info(`Bot stopped. Final P/L: $${netProfit.toFixed(2)}`);
    }
    shouldStopRef.current = false;
  }, [isAuthorized, isRunning, stake, m1Enabled, m2Enabled, m1Contract, m2Contract, m1Barrier, m2Barrier, m1Symbol, m2Symbol, m1HookEnabled, m2HookEnabled, m1VirtualLossCount, m2VirtualLossCount, m1RealCount, m2RealCount, m1StrategyEnabled, m2StrategyEnabled, m1StrategyMode, m2StrategyMode, m1PatternValid, m2PatternValid, m1CombinedEnabled, m2CombinedEnabled, m1CombinedPatterns, m2CombinedPatterns, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, turboMode, authBalance, addLog, ensureConnection, checkPatternMatch, checkDigitCondition, checkCombinedForSymbol, executeRealTrade, waitForPattern, cleanM1Pattern, cleanM2Pattern, refreshBalance, netProfit]);
  
  const stopBot = useCallback(() => {
    shouldStopRef.current = true;
    runningRef.current = false;
    setIsRunning(false);
    const currentStatus = botStatus;
    setBotStatus('idle');
    patternTradeTakenRef.current = false;
    combinedTradeTakenRef.current = false;
    toast.info('🛑 Bot stopped manually');
    
    addLog({
      time: new Date().toLocaleTimeString(),
      market: 'SYSTEM',
      symbol: 'BOT',
      contract: 'STOP',
      stake: 0,
      martingaleStep: 0,
      exitDigit: '-',
      result: 'Pending',
      pnl: netProfit,
      balance: localBalance,
      switchInfo: `🛑 Bot manually stopped. P/L: $${netProfit.toFixed(2)}`,
    });
  }, [addLog, netProfit, localBalance, botStatus]);
  
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
  const statusConfig: Record<BotStatus, { icon: string; label: string; color: string }> = {
    idle: { icon: '⚪', label: 'IDLE', color: 'text-muted-foreground' },
    trading_m1: { icon: '🟢', label: 'TRADING M1', color: 'text-profit' },
    recovery: { icon: '🟣', label: 'RECOVERY MODE', color: 'text-purple-400' },
    waiting_pattern: { icon: '🟡', label: 'WAITING PATTERN', color: 'text-warning' },
    pattern_matched: { icon: '✅', label: 'PATTERN MATCHED', color: 'text-profit' },
    virtual_hook: { icon: '🎣', label: 'VIRTUAL HOOK', color: 'text-primary' },
    reconnecting: { icon: '🔄', label: 'RECONNECTING...', color: 'text-orange-400' },
    insufficient_funds: { icon: '💰', label: 'INSUFFICIENT FUNDS', color: 'text-rose-400' },
  };
  const status = statusConfig[botStatus];
  
  return (
    <>
      <TPSLNotificationPopup />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Ramzfx Speed Bot</h1>
                <p className="text-xs text-slate-400">Dual Market Trading System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${derivApi.isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {derivApi.isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{derivApi.isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <Badge className={`${status.color} text-xs px-3 py-1 bg-white/10`}>{status.icon} {status.label}</Badge>
              {isRunning && (
                <Badge variant="outline" className="text-xs text-amber-400 animate-pulse">
                  P/L: ${netProfit.toFixed(2)}
                </Badge>
              )}
            </div>
          </div>

          {/* Dual Markets Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            
            {/* Market 1 - Primary */}
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <Home className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-blue-400">PRIMARY MARKET (M1)</h3>
                    <p className="text-xs text-slate-400">Main Trading Channel</p>
                  </div>
                </div>
                <Switch checked={m1Enabled} onCheckedChange={setM1Enabled} disabled={isRunning} />
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Symbol</label>
                    <Select value={m1Symbol} onValueChange={setM1Symbol} disabled={isRunning}>
                      <SelectTrigger className="bg-slate-800/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_MARKETS.map(m => (
                          <SelectItem key={m.symbol} value={m.symbol}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Contract Type</label>
                    <Select value={m1Contract} onValueChange={setM1Contract} disabled={isRunning}>
                      <SelectTrigger className="bg-slate-800/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TYPES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {needsBarrier(m1Contract) && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Barrier (0-9)</label>
                    <Input 
                      type="number" 
                      min="0" 
                      max="9" 
                      value={m1Barrier} 
                      onChange={e => setM1Barrier(e.target.value)} 
                      className="bg-slate-800/50"
                      disabled={isRunning} 
                    />
                  </div>
                )}
                
                <button 
                  onClick={() => setExpandedM1(!expandedM1)} 
                  className="w-full text-xs text-slate-400 hover:text-blue-400 flex items-center justify-center gap-2 py-2"
                >
                  {expandedM1 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expandedM1 ? 'Show Less Options' : 'Show More Options'}
                </button>
                
                {expandedM1 && (
                  <div className="space-y-3 pt-3 border-t border-blue-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Virtual Hook Strategy</span>
                      <Switch checked={m1HookEnabled} onCheckedChange={setM1HookEnabled} disabled={isRunning} />
                    </div>
                    
                    {m1HookEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Required Losses</label>
                          <Input 
                            type="number" 
                            value={m1VirtualLossCount} 
                            onChange={e => setM1VirtualLossCount(e.target.value)} 
                            className="bg-slate-800/50"
                            disabled={isRunning}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Real Trades After</label>
                          <Input 
                            type="number" 
                            value={m1RealCount} 
                            onChange={e => setM1RealCount(e.target.value)} 
                            className="bg-slate-800/50"
                            disabled={isRunning}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Combined Strategy</span>
                      <Switch checked={m1CombinedEnabled} onCheckedChange={setM1CombinedEnabled} disabled={isRunning} />
                    </div>
                    
                    {m1CombinedEnabled && (
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Patterns (comma separated)</label>
                        <Textarea 
                          placeholder="Examples: 1,5,11,112, E,E, OO" 
                          value={m1CombinedPatterns} 
                          onChange={e => setM1CombinedPatterns(e.target.value)} 
                          className="h-20 text-xs font-mono bg-slate-800/50"
                          disabled={isRunning}
                        />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Pattern Strategy</span>
                      <Switch checked={m1StrategyEnabled} onCheckedChange={setM1StrategyEnabled} disabled={isRunning} />
                    </div>
                    
                    {m1StrategyEnabled && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Button 
                            variant={m1StrategyMode === 'pattern' ? 'default' : 'outline'} 
                            className="flex-1"
                            onClick={() => setM1StrategyMode('pattern')}
                            disabled={isRunning}
                          >
                            Pattern (E/O)
                          </Button>
                          <Button 
                            variant={m1StrategyMode === 'digit' ? 'default' : 'outline'} 
                            className="flex-1"
                            onClick={() => setM1StrategyMode('digit')}
                            disabled={isRunning}
                          >
                            Digit Condition
                          </Button>
                        </div>
                        
                        {m1StrategyMode === 'pattern' && (
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">Pattern (E/O only, min 2 chars)</label>
                            <Input 
                              placeholder="Example: EEO" 
                              value={m1Pattern} 
                              onChange={e => setM1Pattern(e.target.value)} 
                              className="bg-slate-800/50 font-mono"
                              disabled={isRunning}
                            />
                            {m1Pattern && m1PatternValid === false && (
                              <p className="text-xs text-rose-400 mt-1">Invalid pattern! Use only E and O</p>
                            )}
                          </div>
                        )}
                        
                        {m1StrategyMode === 'digit' && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Condition</label>
                              <Select value={m1DigitCondition} onValueChange={setM1DigitCondition} disabled={isRunning}>
                                <SelectTrigger className="bg-slate-800/50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="==">=</SelectItem>
                                  <SelectItem value=">">&gt;</SelectItem>
                                  <SelectItem value="<">&lt;</SelectItem>
                                  <SelectItem value=">=">&gt;=</SelectItem>
                                  <SelectItem value="<=">&lt;=</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Value</label>
                              <Input 
                                type="number" 
                                min="0" 
                                max="9" 
                                value={m1DigitCompare} 
                                onChange={e => setM1DigitCompare(e.target.value)} 
                                className="bg-slate-800/50"
                                disabled={isRunning}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Window</label>
                              <Input 
                                type="number" 
                                min="1" 
                                max="10" 
                                value={m1DigitWindow} 
                                onChange={e => setM1DigitWindow(e.target.value)} 
                                className="bg-slate-800/50"
                                disabled={isRunning}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Market 2 - Recovery */}
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-purple-400">RECOVERY MARKET (M2)</h3>
                    <p className="text-xs text-slate-400">Loss Recovery Channel</p>
                  </div>
                </div>
                <Switch checked={m2Enabled} onCheckedChange={setM2Enabled} disabled={isRunning} />
              </div>
              
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Symbol</label>
                    <Select value={m2Symbol} onValueChange={setM2Symbol} disabled={isRunning}>
                      <SelectTrigger className="bg-slate-800/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_MARKETS.map(m => (
                          <SelectItem key={m.symbol} value={m.symbol}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Contract Type</label>
                    <Select value={m2Contract} onValueChange={setM2Contract} disabled={isRunning}>
                      <SelectTrigger className="bg-slate-800/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTRACT_TYPES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {needsBarrier(m2Contract) && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Barrier (0-9)</label>
                    <Input 
                      type="number" 
                      min="0" 
                      max="9" 
                      value={m2Barrier} 
                      onChange={e => setM2Barrier(e.target.value)} 
                      className="bg-slate-800/50"
                      disabled={isRunning} 
                    />
                  </div>
                )}
                
                <button 
                  onClick={() => setExpandedM2(!expandedM2)} 
                  className="w-full text-xs text-slate-400 hover:text-purple-400 flex items-center justify-center gap-2 py-2"
                >
                  {expandedM2 ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expandedM2 ? 'Show Less Options' : 'Show More Options'}
                </button>
                
                {expandedM2 && (
                  <div className="space-y-3 pt-3 border-t border-purple-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Virtual Hook Strategy</span>
                      <Switch checked={m2HookEnabled} onCheckedChange={setM2HookEnabled} disabled={isRunning} />
                    </div>
                    
                    {m2HookEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Required Losses</label>
                          <Input 
                            type="number" 
                            value={m2VirtualLossCount} 
                            onChange={e => setM2VirtualLossCount(e.target.value)} 
                            className="bg-slate-800/50"
                            disabled={isRunning}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">Real Trades After</label>
                          <Input 
                            type="number" 
                            value={m2RealCount} 
                            onChange={e => setM2RealCount(e.target.value)} 
                            className="bg-slate-800/50"
                            disabled={isRunning}
                          />
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Combined Strategy</span>
                      <Switch checked={m2CombinedEnabled} onCheckedChange={setM2CombinedEnabled} disabled={isRunning} />
                    </div>
                    
                    {m2CombinedEnabled && (
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Patterns (comma separated)</label>
                        <Textarea 
                          placeholder="Examples: 1,5,11,112, E,E, OO" 
                          value={m2CombinedPatterns} 
                          onChange={e => setM2CombinedPatterns(e.target.value)} 
                          className="h-20 text-xs font-mono bg-slate-800/50"
                          disabled={isRunning}
                        />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Pattern Strategy</span>
                      <Switch checked={m2StrategyEnabled} onCheckedChange={setM2StrategyEnabled} disabled={isRunning} />
                    </div>
                    
                    {m2StrategyEnabled && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <Button 
                            variant={m2StrategyMode === 'pattern' ? 'default' : 'outline'} 
                            className="flex-1"
                            onClick={() => setM2StrategyMode('pattern')}
                            disabled={isRunning}
                          >
                            Pattern (E/O)
                          </Button>
                          <Button 
                            variant={m2StrategyMode === 'digit' ? 'default' : 'outline'} 
                            className="flex-1"
                            onClick={() => setM2StrategyMode('digit')}
                            disabled={isRunning}
                          >
                            Digit Condition
                          </Button>
                        </div>
                        
                        {m2StrategyMode === 'pattern' && (
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">Pattern (E/O only, min 2 chars)</label>
                            <Input 
                              placeholder="Example: EEO" 
                              value={m2Pattern} 
                              onChange={e => setM2Pattern(e.target.value)} 
                              className="bg-slate-800/50 font-mono"
                              disabled={isRunning}
                            />
                            {m2Pattern && m2PatternValid === false && (
                              <p className="text-xs text-rose-400 mt-1">Invalid pattern! Use only E and O</p>
                            )}
                          </div>
                        )}
                        
                        {m2StrategyMode === 'digit' && (
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Condition</label>
                              <Select value={m2DigitCondition} onValueChange={setM2DigitCondition} disabled={isRunning}>
                                <SelectTrigger className="bg-slate-800/50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="==">=</SelectItem>
                                  <SelectItem value=">">&gt;</SelectItem>
                                  <SelectItem value="<">&lt;</SelectItem>
                                  <SelectItem value=">=">&gt;=</SelectItem>
                                  <SelectItem value="<=">&lt;=</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Value</label>
                              <Input 
                                type="number" 
                                min="0" 
                                max="9" 
                                value={m2DigitCompare} 
                                onChange={e => setM2DigitCompare(e.target.value)} 
                                className="bg-slate-800/50"
                                disabled={isRunning}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">Window</label>
                              <Input 
                                type="number" 
                                min="1" 
                                max="10" 
                                value={m2DigitWindow} 
                                onChange={e => setM2DigitWindow(e.target.value)} 
                                className="bg-slate-800/50"
                                disabled={isRunning}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Risk Management */}
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-amber-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-400">Risk Management & Settings</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Base Stake ($)</label>
                <Input 
                  type="number" 
                  min="0.35" 
                  step="0.01" 
                  value={stake} 
                  onChange={e => setStake(e.target.value)} 
                  disabled={isRunning}
                  className="bg-slate-800/50"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Take Profit ($)</label>
                <Input 
                  type="number" 
                  value={takeProfit} 
                  onChange={e => setTakeProfit(e.target.value)} 
                  disabled={isRunning}
                  className="bg-slate-800/50"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Stop Loss ($)</label>
                <Input 
                  type="number" 
                  value={stopLoss} 
                  onChange={e => setStopLoss(e.target.value)} 
                  disabled={isRunning}
                  className="bg-slate-800/50"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Turbo Mode</label>
                <Button 
                  variant={turboMode ? 'default' : 'outline'} 
                  className={`w-full ${turboMode ? 'bg-amber-500' : ''}`}
                  onClick={() => setTurboMode(!turboMode)} 
                  disabled={isRunning}
                >
                  {turboMode ? '⚡ Turbo Enabled' : '🐢 Normal Mode'}
                </Button>
              </div>
            </div>
            
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-amber-500/20">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">Martingale</span>
                <Switch checked={martingaleOn} onCheckedChange={setMartingaleOn} disabled={isRunning} />
              </div>
              
              {martingaleOn && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Multiplier:</span>
                    <Input 
                      type="number" 
                      min="1.1" 
                      step="0.1" 
                      value={martingaleMultiplier} 
                      onChange={e => setMartingaleMultiplier(e.target.value)} 
                      className="w-24 h-8 text-sm bg-slate-800/50"
                      placeholder="x"
                      disabled={isRunning}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Max Steps:</span>
                    <Input 
                      type="number" 
                      min="1" 
                      max="10" 
                      value={martingaleMaxSteps} 
                      onChange={e => setMartingaleMaxSteps(e.target.value)} 
                      className="w-20 h-8 text-sm bg-slate-800/50"
                      placeholder="steps"
                      disabled={isRunning}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Start/Stop Button */}
          <button
            onClick={isRunning ? stopBot : startBot}
            disabled={(!isRunning && (!isAuthorized || localBalance < parseFloat(stake) || (!isConnected && !isRunning)))}
            className={`relative w-full h-14 text-base font-bold rounded-xl transition-all mb-6 ${
              isRunning 
                ? 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-700 hover:to-red-600' 
                : 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]`}
          >
            <div className="flex items-center justify-center gap-2">
              {isRunning ? (
                <><StopCircle className="w-5 h-5" /> STOP BOT</>
              ) : (
                <><Play className="w-5 h-5" /> START BOT</>
              )}
            </div>
          </button>
          
          {/* Live Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-blue-400 mb-3">Bot Status</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Current Status</div>
                  <div className={`text-lg font-bold ${status.color}`}>{status.icon} {status.label}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Active Market</div>
                  <div className={`text-lg font-bold ${currentMarket === 1 ? 'text-blue-400' : 'text-purple-400'}`}>
                    {currentMarket === 1 ? 'M1 - Primary' : 'M2 - Recovery'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Current Stake</div>
                  <div className="text-lg font-bold text-amber-400">${currentStake.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Martingale Step</div>
                  <div className="text-lg font-bold">{martingaleStep}</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-purple-400 mb-3">Performance</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-400 mb-1">Win Rate</div>
                  <div className="text-lg font-bold text-emerald-400">{winRate}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Profit/Loss</div>
                  <div className={`text-lg font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${netProfit.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Balance</div>
                  <div className="text-lg font-bold text-blue-400">${localBalance.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Wins / Losses</div>
                  <div className="text-lg font-bold">
                    <span className="text-emerald-400">{wins}</span> / <span className="text-rose-400">{losses}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Activity Log */}
          <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-indigo-500/30 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-indigo-500/30 flex items-center justify-between bg-slate-800/20">
              <h3 className="text-xs font-semibold flex items-center gap-1.5 text-indigo-400">
                <RefreshCw className="w-3 h-3" /> Trading Activity Log
              </h3>
              <Button variant="ghost" size="sm" onClick={clearLog} className="text-[10px] h-6 px-2">
                <Trash2 className="w-2.5 h-2.5 mr-1" /> Clear
              </Button>
            </div>
            
            <div className="max-h-96 overflow-auto text-[10px]">
              <table className="w-full text-[10px]">
                <thead className="text-[9px] text-slate-400 bg-slate-800/30 sticky top-0">
                  <tr>
                    <th className="text-left p-1.5 font-medium w-[60px]">Time</th>
                    <th className="text-left p-1.5 font-medium w-[45px]">Mkt</th>
                    <th className="text-left p-1.5 font-medium w-[60px]">Sym</th>
                    <th className="text-left p-1.5 font-medium w-[40px]">Type</th>
                    <th className="text-right p-1.5 font-medium w-[55px]">Stake</th>
                    <th className="text-center p-1.5 font-medium w-[45px]">Digit</th>
                    <th className="text-center p-1.5 font-medium w-[50px]">Result</th>
                    <th className="text-right p-1.5 font-medium w-[50px]">P/L</th>
                    <th className="text-left p-1.5 font-medium">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {logEntries.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center text-slate-500 py-8 text-[10px]">
                        No trading activity yet. Start the bot to begin trading.
                      </td>
                    </tr>
                  ) : (
                    logEntries.map(e => (
                      <tr key={e.id} className={`border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors ${
                        e.market === 'M1' ? 'border-l-2 border-l-blue-500' : 
                        e.market === 'VH' ? 'border-l-2 border-l-indigo-500' : 
                        e.market === 'COMBINED' ? 'border-l-2 border-l-green-500' : 
                        e.market === 'SYSTEM' ? 'border-l-2 border-l-amber-500' :
                        'border-l-2 border-l-purple-500'
                      }`}>
                        <td className="p-1.5 font-mono text-[9px] text-slate-300 whitespace-nowrap">{e.time}</td>
                        <td className={`p-1.5 font-bold text-[10px] ${
                          e.market === 'M1' ? 'text-blue-400' : 
                          e.market === 'VH' ? 'text-indigo-400' : 
                          e.market === 'COMBINED' ? 'text-green-400' : 
                          e.market === 'SYSTEM' ? 'text-amber-400' :
                          'text-purple-400'
                        }`}>
                          {e.market}
                        </td>
                        <td className="p-1.5 font-mono text-[9px] text-slate-300">{e.symbol}</td>
                        <td className="p-1.5 text-[9px] text-slate-400">{e.contract.replace('DIGIT', '')}</td>
                        <td className="p-1.5 text-right font-mono text-[9px]">
                          {e.market === 'VH' ? (
                            <span className="text-slate-500">VIRTUAL</span>
                          ) : (
                            <span className="text-amber-400 font-medium">${e.stake.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="p-1.5 text-center font-mono font-bold text-[11px] text-slate-200">{e.exitDigit}</td>
                        <td className="p-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            e.result === 'Win' || e.result === 'V-Win' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : e.result === 'Loss' || e.result === 'V-Loss' 
                              ? 'bg-rose-500/20 text-rose-400' 
                              : 'bg-yellow-500/20 text-yellow-500'
                          }`}>
                            {e.result === 'Pending' ? '...' : e.result === 'V-Win' ? '✓ V-Win' : e.result === 'V-Loss' ? '✗ V-Loss' : e.result}
                          </span>
                        </td>
                        <td className={`p-1.5 text-right font-bold text-[10px] ${
                          e.pnl > 0 ? 'text-emerald-400' : e.pnl < 0 ? 'text-rose-400' : 'text-slate-500'
                        }`}>
                          {e.result === 'Pending' ? '...' : `${e.pnl > 0 ? '+' : ''}${e.pnl.toFixed(2)}`}
                        </td>
                        <td className="p-1.5 text-[9px] text-slate-400 max-w-[200px] truncate" title={e.switchInfo}>
                          {e.switchInfo || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
