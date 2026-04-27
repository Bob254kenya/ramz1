import { useState, useCallback, useRef, useEffect } from 'react';
import { derivApi } from '@/services/deriv-api';
import { getLastDigit } from '@/services/analysis';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Play, StopCircle, Trash2, Home, RefreshCw, Shield, Zap, Eye, Anchor, Trophy,
  TrendingUp, TrendingDown, BarChart3, Volume2, VolumeX, Wifi, WifiOff, GripVertical, Combine, Sparkles, ChevronDown, ChevronUp, Target, Activity, Gauge, Clock
} from 'lucide-react';
import { toast } from 'sonner';

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
  { value: 'DIGITEVEN', label: 'Even' },
  { value: 'DIGITODD', label: 'Odd' },
  { value: 'DIGITMATCH', label: 'Match' },
  { value: 'DIGITDIFF', label: 'Differs' },
  { value: 'DIGITOVER', label: 'Over' },
  { value: 'DIGITUNDER', label: 'Under' },
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

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-right duration-300">
      <div className={`rounded-lg shadow-xl overflow-hidden ${isTP ? 'bg-gradient-to-r from-emerald-600 to-emerald-500' : 'bg-gradient-to-r from-rose-600 to-rose-500'}`}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${isTP ? 'bg-emerald-400/30' : 'bg-rose-400/30'}`}>
            {isTP ? '🎉' : '😢'}
          </div>
          <div className="flex-1">
            <p className="text-white text-xs font-medium">{notification.message}</p>
            {notification.amount && (
              <p className={`text-xs font-bold ${isTP ? 'text-emerald-200' : 'text-rose-200'}`}>
                {isTP ? '+' : '-'}${Math.abs(notification.amount).toFixed(2)}
              </p>
            )}
          </div>
          <button onClick={() => setIsVisible(false)} className="text-white/70 hover:text-white text-xs">
            OK
          </button>
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

const tickBuffers: Map<string, CircularTickBuffer> = new Map();

function getTickBuffer(symbol: string): CircularTickBuffer {
  if (!tickBuffers.has(symbol)) {
    tickBuffers.set(symbol, new CircularTickBuffer(1000));
  }
  return tickBuffers.get(symbol)!;
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// MAIN COMPONENT
// ============================================

export default function RamzfxSpeedBot() {
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
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  
  // ========== BOT STATE ==========
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const shouldStopRef = useRef(false);
  const [botStatus, setBotStatus] = useState<BotStatus>('idle');
  const [currentMarket, setCurrentMarket] = useState<1 | 2>(1);
  const [currentStake, setCurrentStakeState] = useState(0);
  const [martingaleStep, setMartingaleStepState] = useState(0);
  const [netProfit, setNetProfit] = useState(0);
  const [balance, setBalance] = useState(10000);
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
  
  // Connection
  const [isConnected, setIsConnected] = useState(true);
  
  // Voice synthesis
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);
  
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
    shouldStopRef.current = false;
    toast.info('Log cleared');
  }, []);
  
  // ========== TICK SUBSCRIPTION ==========
  useEffect(() => {
    const handleTick = (data: any) => {
      if (data.tick && data.tick.symbol) {
        const digit = getLastDigit(data.tick.quote);
        const buffer = getTickBuffer(data.tick.symbol);
        buffer.push(digit);
      }
    };
    
    const unsubscribe = derivApi.onMessage(handleTick);
    return () => unsubscribe();
  }, []);
  
  // ========== STRATEGY CHECKING ==========
  const cleanM1Pattern = m1Pattern.toUpperCase().replace(/[^EO]/g, '');
  const m1PatternValid = cleanM1Pattern.length >= 2;
  const cleanM2Pattern = m2Pattern.toUpperCase().replace(/[^EO]/g, '');
  const m2PatternValid = cleanM2Pattern.length >= 2;
  
  const checkPatternMatch = useCallback((symbol: string, pattern: string): boolean => {
    const buffer = getTickBuffer(symbol);
    const digits = buffer.last(pattern.length);
    if (digits.length < pattern.length) return false;
    for (let i = 0; i < pattern.length; i++) {
      const expected = pattern[i];
      const actual = digits[i] % 2 === 0 ? 'E' : 'O';
      if (expected !== actual) return false;
    }
    return true;
  }, []);
  
  const checkDigitCondition = useCallback((symbol: string, condition: string, compare: string, windowStr: string): boolean => {
    const buffer = getTickBuffer(symbol);
    const win = parseInt(windowStr) || 3;
    const comp = parseInt(compare);
    const digits = buffer.last(win);
    if (digits.length < win) return false;
    return digits.every(d => {
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
    const buffer = getTickBuffer(symbol);
    const digits = buffer.last(100);
    return checkCombinedPattern(digits, patterns);
  }, []);
  
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
    // Check balance first
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
        switchInfo: `❌ INSUFFICIENT FUNDS! Required: $${cStake.toFixed(2)}, Available: $${currentBalance.toFixed(2)}`,
      });
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
      switchInfo: `Placing ${cfg.contract} order...`,
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
      if (!turboMode) {
        await waitForNextTick(tradeSymbol);
      }
      
      const buyParams: any = {
        contract_type: cfg.contract,
        symbol: tradeSymbol,
        duration: 1,
        duration_unit: 't',
        basis: 'stake',
        amount: cStake,
      };
      
      if (needsBarrier(cfg.contract)) {
        buyParams.barrier = cfg.barrier;
      }
      
      const buyResponse = await derivApi.buyContract(buyParams);
      
      if (!buyResponse || !buyResponse.contractId) {
        throw new Error('Contract purchase failed');
      }
      
      contractExecuted = true;
      updateLog(logId, { switchInfo: `Contract purchased! ID: ${buyResponse.contractId}` });
      
      const result = await derivApi.waitForContractResult(buyResponse.contractId);
      
      won = result.status === 'won';
      const pnl = result.profit || 0;
      
      updatedPnl = currentPnl + pnl;
      updatedBalance = currentBalance + pnl;
      setBalance(updatedBalance);
      setNetProfit(updatedPnl);
      
      const exitDigit = String(getLastDigit(result.sellPrice || result.bidPrice || 0));
      let switchInfo = '';
      
      if (won) {
        setWins(prev => prev + 1);
        if (inRecovery) { 
          switchInfo = '✓ Recovery WIN → Back to M1'; 
          inRecovery = false; 
        } else { 
          switchInfo = '→ Continue M1'; 
        }
        newMStep = 0;
        newCStake = baseStake;
        if (voiceEnabled) speak(`Win! Profit $${pnl.toFixed(2)}`);
      } else {
        setLosses(prev => prev + 1);
        if (!inRecovery && m2Enabled) { 
          inRecovery = true; 
          switchInfo = '✗ Loss → Switch to M2 (Recovery)'; 
        } else { 
          switchInfo = inRecovery ? '→ Stay M2' : '→ Continue M1'; 
        }
        if (voiceEnabled) speak(`Loss. $${Math.abs(pnl).toFixed(2)}`);
        
        if (martingaleOn) {
          const maxS = parseInt(martingaleMaxSteps) || 5;
          if (mStep < maxS) {
            newCStake = parseFloat((cStake * (parseFloat(martingaleMultiplier) || 2)).toFixed(2));
            newMStep++;
            switchInfo += ` | Martingale step ${newMStep}/${maxS}, stake: $${newCStake.toFixed(2)}`;
          } else { 
            newMStep = 0; 
            newCStake = baseStake;
            switchInfo += ' (Martingale max steps reached, resetting)';
          }
        }
      }
      
      setMartingaleStepState(newMStep);
      setCurrentStakeState(newCStake);
      
      updateLog(logId, { 
        exitDigit, 
        result: won ? 'Win' : 'Loss', 
        pnl, 
        balance: updatedBalance, 
        switchInfo 
      });
      
      let shouldBreak = false;
      const tpValue = parseFloat(takeProfit);
      const slValue = parseFloat(stopLoss);
      
      if (updatedPnl >= tpValue) {
        const showFn = (window as any).showTPNotification;
        if (showFn) showFn('tp', `Take Profit Target Hit!`, updatedPnl);
        shouldBreak = true;
        shouldStopRef.current = true;
        addLog({
          time: new Date().toLocaleTimeString(),
          market: 'SYSTEM',
          symbol: 'TP/SL',
          contract: '-',
          stake: 0,
          martingaleStep: 0,
          exitDigit: '-',
          result: 'Pending',
          pnl: updatedPnl,
          balance: updatedBalance,
          switchInfo: `✅ Take Profit reached! Stopping bot.`,
        });
        if (voiceEnabled) speak(`Take profit reached! Total profit ${updatedPnl.toFixed(2)} dollars`);
      }
      
      if (updatedPnl <= -slValue) {
        const showFn = (window as any).showTPNotification;
        if (showFn) showFn('sl', `Stop Loss Target Hit!`, Math.abs(updatedPnl));
        shouldBreak = true;
        shouldStopRef.current = true;
        addLog({
          time: new Date().toLocaleTimeString(),
          market: 'SYSTEM',
          symbol: 'TP/SL',
          contract: '-',
          stake: 0,
          martingaleStep: 0,
          exitDigit: '-',
          result: 'Pending',
          pnl: updatedPnl,
          balance: updatedBalance,
          switchInfo: `❌ Stop Loss reached! Stopping bot.`,
        });
        if (voiceEnabled) speak(`Stop loss hit! Total loss ${Math.abs(updatedPnl).toFixed(2)} dollars`);
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
      
      if (err.message && (err.message.toLowerCase().includes('balance') || err.message.toLowerCase().includes('funds'))) {
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
  }, [addLog, updateLog, m2Enabled, martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, turboMode, voiceEnabled, speak]);
  
  // ========== START BOT ==========
  const startBot = useCallback(async () => {
    if (isRunning) {
      toast.warning('Bot is already running');
      return;
    }
    
    const baseStake = parseFloat(stake);
    if (isNaN(baseStake) || baseStake < 0.35) {
      toast.error('Minimum stake is $0.35');
      return;
    }
    
    if (!m1Enabled && !m2Enabled) {
      toast.error('Both markets are disabled');
      return;
    }
    
    if (m1StrategyEnabled && m1StrategyMode === 'pattern' && m1Pattern.trim().length > 0 && !m1PatternValid) {
      toast.error('Invalid M1 pattern (min 2 chars, E/O only)');
      return;
    }
    
    if (m2StrategyEnabled && m2StrategyMode === 'pattern' && m2Pattern.trim().length > 0 && !m2PatternValid) {
      toast.error('Invalid M2 pattern (min 2 chars, E/O only)');
      return;
    }
    
    if (balance < baseStake) {
      toast.error(`Insufficient balance! Need $${baseStake.toFixed(2)}`);
      return;
    }
    
    // Reset bot state
    shouldStopRef.current = false;
    setIsRunning(true);
    runningRef.current = true;
    setBotStatus('trading_m1');
    setCurrentMarket(1);
    setCurrentStakeState(baseStake);
    setMartingaleStepState(0);
    patternTradeTakenRef.current = false;
    setNetProfit(0);
    setWins(0);
    setLosses(0);
    setTotalStaked(0);
    
    let cStake = baseStake;
    let mStep = 0;
    let inRecovery = false;
    let currentPnl = 0;
    let currentBalance = balance;
    
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
    
    toast.success(`Bot started with stake $${baseStake.toFixed(2)}`);
    if (voiceEnabled) speak(`Bot started with stake ${baseStake.toFixed(2)} dollars`);
    
    // Main trading loop
    while (runningRef.current && !shouldStopRef.current) {
      try {
        // Check TP/SL
        if (currentPnl >= parseFloat(takeProfit)) {
          addLog({
            time: new Date().toLocaleTimeString(),
            market: 'SYSTEM',
            symbol: 'TP/SL',
            contract: '-',
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Pending',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `✅ Take Profit reached: $${currentPnl.toFixed(2)}. Stopping bot.`,
          });
          shouldStopRef.current = true;
          break;
        }
        
        if (currentPnl <= -parseFloat(stopLoss)) {
          addLog({
            time: new Date().toLocaleTimeString(),
            market: 'SYSTEM',
            symbol: 'TP/SL',
            contract: '-',
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Pending',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `❌ Stop Loss reached: $${currentPnl.toFixed(2)}. Stopping bot.`,
          });
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
          toast.error(`Bot stopped - Insufficient funds!`);
          setBotStatus('insufficient_funds');
          break;
        }
        
        const mkt: 1 | 2 = inRecovery ? 2 : 1;
        setCurrentMarket(mkt);
        
        if (mkt === 1 && !m1Enabled) { 
          if (m2Enabled) { 
            inRecovery = true; 
            setBotStatus('recovery');
            continue; 
          } else break; 
        }
        
        if (mkt === 2 && !m2Enabled) { 
          inRecovery = false; 
          setBotStatus('trading_m1');
          continue; 
        }
        
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
          addLog({
            time: new Date().toLocaleTimeString(),
            market: mkt === 1 ? 'M1' : 'M2',
            symbol: tradeSymbol,
            contract: combinedPatterns,
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Pending',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `🔍 Waiting for combined pattern: ${combinedPatterns}`,
          });
          
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
              pnl: currentPnl, 
              balance: currentBalance, 
              switchInfo: `🎯 COMBINED PATTERN MATCHED! ${combinedPatterns}` 
            });
            patternMatched = true;
          } else if (!matched) {
            addLog({
              time: new Date().toLocaleTimeString(),
              market: mkt === 1 ? 'M1' : 'M2',
              symbol: tradeSymbol,
              contract: 'PATTERN',
              stake: 0,
              martingaleStep: 0,
              exitDigit: '-',
              result: 'Pending',
              pnl: currentPnl,
              balance: currentBalance,
              switchInfo: `⏱️ Pattern timeout, continuing...`,
            });
            continue;
          }
        }
        
        // Regular strategy check
        if (!patternMatched && strategyActive) {
          setBotStatus('waiting_pattern');
          let checkFn: () => boolean;
          let strategyDescription = '';
          
          if (mkt === 1) {
            if (m1StrategyMode === 'pattern') {
              checkFn = () => checkPatternMatch(tradeSymbol, cleanM1Pattern);
              strategyDescription = `pattern ${cleanM1Pattern}`;
            } else {
              checkFn = () => checkDigitCondition(tradeSymbol, m1DigitCondition, m1DigitCompare, m1DigitWindow);
              strategyDescription = `digit ${m1DigitCondition} ${m1DigitCompare} (window ${m1DigitWindow})`;
            }
          } else {
            if (m2StrategyMode === 'pattern') {
              checkFn = () => checkPatternMatch(tradeSymbol, cleanM2Pattern);
              strategyDescription = `pattern ${cleanM2Pattern}`;
            } else {
              checkFn = () => checkDigitCondition(tradeSymbol, m2DigitCondition, m2DigitCompare, m2DigitWindow);
              strategyDescription = `digit ${m2DigitCondition} ${m2DigitCompare} (window ${m2DigitWindow})`;
            }
          }
          
          addLog({
            time: new Date().toLocaleTimeString(),
            market: mkt === 1 ? 'M1' : 'M2',
            symbol: tradeSymbol,
            contract: 'STRATEGY',
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Pending',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `🔍 Waiting for ${strategyDescription}`,
          });
          
          const matched = await waitForPattern(tradeSymbol, checkFn, 30000);
          
          if (matched && runningRef.current && !shouldStopRef.current) {
            setBotStatus('pattern_matched');
            await delay(turboMode ? 100 : 300);
            addLog({
              time: new Date().toLocaleTimeString(),
              market: mkt === 1 ? 'M1' : 'M2',
              symbol: tradeSymbol,
              contract: 'STRATEGY',
              stake: 0,
              martingaleStep: 0,
              exitDigit: '-',
              result: 'Pending',
              pnl: currentPnl,
              balance: currentBalance,
              switchInfo: `✅ Pattern matched! Executing ${cfg.contract} trade...`,
            });
            patternMatched = true;
          } else if (!matched) {
            addLog({
              time: new Date().toLocaleTimeString(),
              market: mkt === 1 ? 'M1' : 'M2',
              symbol: tradeSymbol,
              contract: 'PATTERN',
              stake: 0,
              martingaleStep: 0,
              exitDigit: '-',
              result: 'Pending',
              pnl: currentPnl,
              balance: currentBalance,
              switchInfo: `⏱️ Pattern timeout, continuing...`,
            });
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
          
          addLog({
            time: new Date().toLocaleTimeString(),
            market: 'VH',
            symbol: tradeSymbol,
            contract: cfg.contract,
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Pending',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `🎣 Virtual Hook started. Need ${requiredLosses} consecutive losses before ${realCount} real trades.`,
          });
          
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
              pnl: currentPnl, 
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
          
          addLog({
            time: new Date().toLocaleTimeString(),
            market: 'VH',
            symbol: tradeSymbol,
            contract: cfg.contract,
            stake: 0,
            martingaleStep: 0,
            exitDigit: '-',
            result: 'Pending',
            pnl: currentPnl,
            balance: currentBalance,
            switchInfo: `✅ Virtual Hook completed! Executing ${realCount} real ${cfg.contract} trades...`,
          });
          
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
          await delay(turboMode ? 100 : 400);
          continue;
        }
        
        // Normal trade execution
        addLog({
          time: new Date().toLocaleTimeString(),
          market: mkt === 1 ? 'M1' : 'M2',
          symbol: tradeSymbol,
          contract: cfg.contract,
          stake: cStake,
          martingaleStep: mStep,
          exitDigit: '-',
          result: 'Pending',
          pnl: currentPnl,
          balance: currentBalance,
          switchInfo: `Executing ${cfg.contract} trade on ${tradeSymbol}...`,
        });
        
        const result = await executeRealTrade(cfg, tradeSymbol, cStake, mStep, mkt, currentBalance, currentPnl, baseStake);
        if (!result.contractExecuted) {
          await delay(1000);
          continue;
        }
        
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
        await delay(turboMode ? 100 : 400);
        
      } catch (err: any) {
        console.error('Bot loop error:', err);
        addLog({
          time: new Date().toLocaleTimeString(),
          market: 'SYSTEM',
          symbol: 'ERROR',
          contract: 'BOT_LOOP',
          stake: 0,
          martingaleStep: 0,
          exitDigit: '-',
          result: 'Failed',
          pnl: currentPnl,
          balance: currentBalance,
          switchInfo: `❌ Bot loop error: ${err.message}`,
        });
        await delay(2000);
      }
    }
    
    setIsRunning(false);
    runningRef.current = false;
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
      balance: balance,
      switchInfo: `🛑 Bot stopped. Final P/L: $${netProfit.toFixed(2)} | Wins: ${wins} | Losses: ${losses}`,
    });
    
    toast.info(`Bot stopped. Final P/L: $${netProfit.toFixed(2)}`);
    if (voiceEnabled) speak(`Bot stopped. Final profit or loss ${netProfit.toFixed(2)} dollars`);
    
    shouldStopRef.current = false;
  }, [isRunning, stake, balance, m1Enabled, m2Enabled, m1Contract, m2Contract, m1Barrier, m2Barrier, m1Symbol, m2Symbol, 
      m1HookEnabled, m2HookEnabled, m1VirtualLossCount, m2VirtualLossCount, m1RealCount, m2RealCount, 
      m1StrategyEnabled, m2StrategyEnabled, m1StrategyMode, m2StrategyMode, m1PatternValid, m2PatternValid,
      m1CombinedEnabled, m2CombinedEnabled, m1CombinedPatterns, m2CombinedPatterns,
      martingaleOn, martingaleMultiplier, martingaleMaxSteps, takeProfit, stopLoss, turboMode,
      checkPatternMatch, checkDigitCondition, checkCombinedForSymbol, executeRealTrade, waitForPattern,
      cleanM1Pattern, cleanM2Pattern, addLog, voiceEnabled, speak, netProfit, wins, losses]);
  
  const stopBot = useCallback(() => {
    shouldStopRef.current = true;
    runningRef.current = false;
    setIsRunning(false);
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
      balance: balance,
      switchInfo: `🛑 Bot manually stopped. Final P/L: $${netProfit.toFixed(2)}`,
    });
  }, [addLog, netProfit, balance]);
  
  const winRate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : '0.0';
  
  const statusConfig: Record<BotStatus, { icon: string; label: string; color: string }> = {
    idle: { icon: '⚪', label: 'IDLE', color: 'text-slate-400' },
    trading_m1: { icon: '🟢', label: 'TRADING M1', color: 'text-emerald-400' },
    recovery: { icon: '🟣', label: 'RECOVERY M2', color: 'text-purple-400' },
    waiting_pattern: { icon: '🟡', label: 'WAITING PATTERN', color: 'text-amber-400' },
    pattern_matched: { icon: '✅', label: 'PATTERN MATCHED', color: 'text-emerald-400' },
    virtual_hook: { icon: '🎣', label: 'VIRTUAL HOOK', color: 'text-cyan-400' },
    reconnecting: { icon: '🔄', label: 'RECONNECTING', color: 'text-orange-400' },
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
                <Zap className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Ramzfx Speed Bot</h1>
                <p className="text-xs text-slate-400">Dual Market Trading System with Virtual Hook</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  voiceEnabled ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                {voiceEnabled ? 'Voice ON' : 'Voice OFF'}
              </button>
              
              <Badge className={`${status.color} text-xs px-3 py-1 bg-white/10`}>
                {status.icon} {status.label}
              </Badge>
              
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
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-blue-500/30 rounded-xl overflow-hidden">
              <div className="p-4">
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
                        <SelectTrigger className="bg-slate-800/50 h-9">
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
                        <SelectTrigger className="bg-slate-800/50 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTRACT_TYPES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
                        className="bg-slate-800/50 h-9"
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
                      {/* Virtual Hook */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Anchor className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm text-slate-300">Virtual Hook Strategy</span>
                        </div>
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
                              className="bg-slate-800/50 h-8"
                              disabled={isRunning}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">Real Trades After</label>
                            <Input 
                              type="number" 
                              value={m1RealCount} 
                              onChange={e => setM1RealCount(e.target.value)} 
                              className="bg-slate-800/50 h-8"
                              disabled={isRunning}
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Combined Strategy */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Combine className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-slate-300">Combined Strategy</span>
                        </div>
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
                      
                      {/* Pattern Strategy */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-slate-300">Pattern Strategy</span>
                        </div>
                        <Switch checked={m1StrategyEnabled} onCheckedChange={setM1StrategyEnabled} disabled={isRunning} />
                      </div>
                      
                      {m1StrategyEnabled && (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Button 
                              variant={m1StrategyMode === 'pattern' ? 'default' : 'outline'} 
                              className="flex-1 h-8 text-xs"
                              onClick={() => setM1StrategyMode('pattern')}
                              disabled={isRunning}
                            >
                              Pattern (E/O)
                            </Button>
                            <Button 
                              variant={m1StrategyMode === 'digit' ? 'default' : 'outline'} 
                              className="flex-1 h-8 text-xs"
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
                                className="bg-slate-800/50 font-mono h-8"
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
                                  <SelectTrigger className="bg-slate-800/50 h-8">
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
                                  className="bg-slate-800/50 h-8"
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
                                  className="bg-slate-800/50 h-8"
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
            
            {/* Market 2 - Recovery */}
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-900/50 backdrop-blur-sm border border-purple-500/30 rounded-xl overflow-hidden">
              <div className="p-4">
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
                        <SelectTrigger className="bg-slate-800/50 h-9">
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
                        <SelectTrigger className="bg-slate-800/50 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONTRACT_TYPES.map(c => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
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
                        className="bg-slate-800/50 h-9"
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
                        <div className="flex items-center gap-2">
                          <Anchor className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm text-slate-300">Virtual Hook Strategy</span>
                        </div>
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
                              className="bg-slate-800/50 h-8"
                              disabled={isRunning}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-slate-400 mb-1 block">Real Trades After</label>
                            <Input 
                              type="number" 
                              value={m2RealCount} 
                              onChange={e => setM2RealCount(e.target.value)} 
                              className="bg-slate-800/50 h-8"
                              disabled={isRunning}
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Combine className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-slate-300">Combined Strategy</span>
                        </div>
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
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-amber-400" />
                          <span className="text-sm text-slate-300">Pattern Strategy</span>
                        </div>
                        <Switch checked={m2StrategyEnabled} onCheckedChange={setM2StrategyEnabled} disabled={isRunning} />
                      </div>
                      
                      {m2StrategyEnabled && (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Button 
                              variant={m2StrategyMode === 'pattern' ? 'default' : 'outline'} 
                              className="flex-1 h-8 text-xs"
                              onClick={() => setM2StrategyMode('pattern')}
                              disabled={isRunning}
                            >
                              Pattern (E/O)
                            </Button>
                            <Button 
                              variant={m2StrategyMode === 'digit' ? 'default' : 'outline'} 
                              className="flex-1 h-8 text-xs"
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
                                className="bg-slate-800/50 font-mono h-8"
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
                                  <SelectTrigger className="bg-slate-800/50 h-8">
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
                                  className="bg-slate-800/50 h-8"
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
                                  className="bg-slate-800/50 h-8"
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
                  className="bg-slate-800/50 h-10"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Take Profit ($)</label>
                <Input 
                  type="number" 
                  step="1" 
                  value={takeProfit} 
                  onChange={e => setTakeProfit(e.target.value)} 
                  disabled={isRunning}
                  className="bg-slate-800/50 h-10"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Stop Loss ($)</label>
                <Input 
                  type="number" 
                  step="1" 
                  value={stopLoss} 
                  onChange={e => setStopLoss(e.target.value)} 
                  disabled={isRunning}
                  className="bg-slate-800/50 h-10"
                />
              </div>
              
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Speed Mode</label>
                <Button 
                  variant={turboMode ? 'default' : 'outline'} 
                  className={`w-full h-10 ${turboMode ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                  onClick={() => setTurboMode(!turboMode)} 
                  disabled={isRunning}
                >
                  {turboMode ? <><Zap className="w-4 h-4 mr-1" /> Turbo</> : <><Clock className="w-4 h-4 mr-1" /> Normal</>}
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
            disabled={(!isRunning && (balance < parseFloat(stake) || !isConnected))}
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
              <h3 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                <Gauge className="w-4 h-4" /> Bot Status
              </h3>
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
              <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
                <Trophy className="w-4 h-4" /> Performance
              </h3>
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
                  <div className="text-lg font-bold text-blue-400">${balance.toFixed(2)}</div>
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
                <Activity className="w-3 h-3" /> Trading Activity Log
              </h3>
              <Button variant="ghost" size="sm" onClick={clearLog} className="text-[10px] h-6 px-2 text-slate-400 hover:text-rose-400">
                <Trash2 className="w-2.5 h-2.5 mr-1" /> Clear
              </Button>
            </div>
            
            <div className="max-h-96 overflow-auto text-[10px]">
              <table className="w-full text-[10px]">
                <thead className="text-[9px] text-slate-400 bg-slate-800/30 sticky top-0">
                  <tr>
                    <th className="text-left p-1.5 font-medium w-[60px]">Time</th>
                    <th className="text-left p-1.5 font-medium w-[45px]">Mkt</th>
                    <th className="text-left p-1.5 font-medium w-[50px]">Sym</th>
                    <th className="text-left p-1.5 font-medium w-[35px]">Type</th>
                    <th className="text-right p-1.5 font-medium w-[55px]">Stake</th>
                    <th className="text-center p-1.5 font-medium w-[45px]">Digit</th>
                    <th className="text-center p-1.5 font-medium w-[55px]">Result</th>
                    <th className="text-right p-1.5 font-medium w-[55px]">P/L</th>
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
                        e.market === 'VH' ? 'border-l-2 border-l-cyan-500' : 
                        e.market === 'COMBINED' ? 'border-l-2 border-l-green-500' : 
                        e.market === 'SYSTEM' ? 'border-l-2 border-l-amber-500' :
                        'border-l-2 border-l-purple-500'
                      }`}>
                        <td className="p-1.5 font-mono text-[9px] text-slate-300 whitespace-nowrap">{e.time}</td>
                        <td className={`p-1.5 font-bold text-[10px] ${
                          e.market === 'M1' ? 'text-blue-400' : 
                          e.market === 'VH' ? 'text-cyan-400' : 
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
                          ) : e.stake > 0 ? (
                            <span className="text-amber-400 font-medium">${e.stake.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="p-1.5 text-center font-mono font-bold text-[11px] text-slate-200">{e.exitDigit}</td>
                        <td className="p-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            e.result === 'Win' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : e.result === 'V-Win'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : e.result === 'Loss' 
                              ? 'bg-rose-500/20 text-rose-400' 
                              : e.result === 'V-Loss'
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
                        <td className="p-1.5 text-[9px] text-slate-400 max-w-[250px] truncate" title={e.switchInfo}>
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
