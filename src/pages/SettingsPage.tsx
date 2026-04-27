import { useState, useEffect, useRef, useCallback } from 'react';
import { derivApi } from '@/services/deriv-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  TrendingUp, TrendingDown, Activity, Zap, Play, Pause, StopCircle,
  Target, ShieldAlert, Volume2, VolumeX, Trophy, Wifi, WifiOff,
  RefreshCw, Plus, X, Anchor, Copy, Users, Combine, Sparkles, RotateCw
} from 'lucide-react';

// ============================================
// TP/SL NOTIFICATION POPUP - COMPONENT
// ============================================

const notificationStyles = `
@keyframes slideUpCenter {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes slideDownCenter {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
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

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 5px rgba(63, 185, 80, 0.3); }
  50% { box-shadow: 0 0 20px rgba(63, 185, 80, 0.6); }
}

.animate-slide-up-center {
  animation: slideUpCenter 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) forwards;
}

.animate-slide-down-center {
  animation: slideDownCenter 0.3s ease-out forwards;
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}

.animate-bounce {
  animation: bounce 0.4s ease-in-out 2;
}

.animate-pulse-slow {
  animation: pulse 1s ease-in-out infinite;
}

.animate-glow {
  animation: glowPulse 2s ease-in-out infinite;
}
`;

// Helper function to show notification (TP/SL)
const showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
  if (typeof window !== 'undefined' && (window as any).showTPNotification) {
    (window as any).showTPNotification(type, message, amount);
  }
};

// TP/SL Notification Component
const TPSLNotificationPopup = () => {
  const [notification, setNotification] = useState<{ type: 'tp' | 'sl'; message: string; amount?: number } | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    (window as any).showTPNotification = (type: 'tp' | 'sl', message: string, amount?: number) => {
      setNotification({ type, message, amount });
      setIsVisible(true);
      setIsExiting(false);
      
      const timeout = setTimeout(() => {
        handleClose();
      }, 8000);
      
      return () => clearTimeout(timeout);
    };
    
    return () => {
      delete (window as any).showTPNotification;
    };
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

  const backgroundIcons = () => {
    const icons = [];
    const iconCount = 12;
    const colors = isTP 
      ? ['#10b981', '#34d399', '#6ee7b7', '#059669']
      : ['#f43f5e', '#fb7185', '#fda4af', '#e11d48'];
    
    for (let i = 0; i < iconCount; i++) {
      const size = 12 + Math.random() * 20;
      const left = Math.random() * 100;
      const delay = Math.random() * 12;
      const duration = 6 + Math.random() * 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const icon = isTP ? '💰' : '😢';
      
      icons.push(
        <div
          key={i}
          className="absolute animate-float"
          style={{
            left: `${left}%`,
            bottom: '-30px',
            fontSize: `${size}px`,
            opacity: 0.25,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
            color: color,
            filter: 'drop-shadow(0 0 2px currentColor)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          {icon}
        </div>
      );
    }
    return icons;
  };

  return (
    <>
      <style>{notificationStyles}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div 
          className={`
            pointer-events-auto w-[500px] h-[300px] rounded-xl shadow-2xl overflow-hidden
            ${isExiting ? 'animate-slide-down-center' : 'animate-slide-up-center'}
          `}
        >
          <div className={`
            relative w-full h-full overflow-hidden
            ${isTP 
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' 
              : 'bg-gradient-to-br from-rose-500 to-rose-700'
            }
          `}>
            <div className="absolute inset-0 overflow-hidden">
              {backgroundIcons()}
            </div>
            
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
            </div>
            
            <div className="relative w-full h-full flex flex-col p-3 z-10">
              <div className="flex items-center gap-2 mb-2">
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-xl
                  ${isTP 
                    ? 'bg-emerald-400/30' 
                    : 'bg-rose-400/30'
                  }
                  shadow-lg backdrop-blur-sm
                  animate-pulse-slow
                  flex-shrink-0
                `}>
                  {isTP ? '🎉' : '😢'}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-bold text-white truncate`}>
                    {isTP ? 'TAKE PROFIT!' : 'STOP LOSS!'}
                  </h3>
                  <p className="text-[8px] text-white/70">
                    {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center text-center mb-2">
                <p className="text-white text-xs font-medium leading-tight">
                  {notification.message}
                </p>
                {amount && (
                  <p className={`text-xl font-bold mt-1 ${isTP ? 'text-emerald-200' : 'text-rose-200'} animate-bounce`}>
                    {isTP ? '+' : '-'}${Math.abs(amount).toFixed(2)}
                  </p>
                )}
              </div>
              
              <button
                onClick={handleClose}
                className={`
                  w-full py-1.5 rounded-lg font-semibold text-xs transition-all duration-200
                  ${isTP 
                    ? 'bg-white/95 text-emerald-600 hover:bg-white hover:scale-[1.02]' 
                    : 'bg-white/95 text-rose-600 hover:bg-white hover:scale-[1.02]'
                  }
                  transform active:scale-[0.98]
                  shadow-lg backdrop-blur-sm
                `}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

/* ── Markets ── */
const ALL_MARKETS = [
  { symbol: '1HZ10V', name: 'Volatility 10 (1s)', group: 'vol1s' },
  { symbol: '1HZ15V', name: 'Volatility 15 (1s)', group: 'vol1s' },
  { symbol: '1HZ25V', name: 'Volatility 25 (1s)', group: 'vol1s' },
  { symbol: '1HZ30V', name: 'Volatility 30 (1s)', group: 'vol1s' },
  { symbol: '1HZ50V', name: 'Volatility 50 (1s)', group: 'vol1s' },
  { symbol: '1HZ75V', name: 'Volatility 75 (1s)', group: 'vol1s' },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s)', group: 'vol1s' },
  { symbol: 'R_10', name: 'Volatility 10', group: 'vol' },
  { symbol: 'R_25', name: 'Volatility 25', group: 'vol' },
  { symbol: 'R_50', name: 'Volatility 50', group: 'vol' },
  { symbol: 'R_75', name: 'Volatility 75', group: 'vol' },
  { symbol: 'R_100', name: 'Volatility 100', group: 'vol' },
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
  { value: 'CALL', label: 'Rise' },
  { value: 'PUT', label: 'Fall' },
  { value: 'DIGITMATCH', label: 'Digits Match' },
  { value: 'DIGITDIFF', label: 'Digits Differs' },
  { value: 'DIGITEVEN', label: 'Digits Even' },
  { value: 'DIGITODD', label: 'Digits Odd' },
  { value: 'DIGITOVER', label: 'Digits Over' },
  { value: 'DIGITUNDER', label: 'Digits Under' },
];

interface TradeRecord {
  id: string;
  time: number;
  type: string;
  stake: number;
  profit: number;
  status: 'won' | 'lost' | 'open';
  symbol: string;
  resultDigit?: number;
  outcomeSymbol?: string;
  isVirtual?: boolean;
  virtualLossCount?: number;
  virtualRequired?: number;
}

// ============================================
// CHECK CONNECTION FUNCTION
// ============================================
const checkConnection = async (): Promise<boolean> => {
  if (!derivApi.isConnected) {
    toast.error('Not connected to Deriv. Please check your connection.');
    return false;
  }
  return true;
};

// Animation variants
const fadeInUpVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

export default function RamzfxSpeedBot() {
  const { isAuthorized, refreshBalance } = useAuth();
  const [symbol, setSymbol] = useState('R_100');
  
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const lastSpokenSignal = useRef('');

  const [botRunning, setBotRunning] = useState(false);
  const [botPaused, setBotPaused] = useState(false);
  const botRunningRef = useRef(false);
  const botPausedRef = useRef(false);
  const shouldStopRef = useRef(false);
  const [botConfig, setBotConfig] = useState({
    botSymbol: 'R_100',
    stake: '1.00',
    contractType: 'CALL',
    prediction: '5',
    duration: '1',
    durationUnit: 't',
    martingale: false,
    multiplier: '2.0',
    stopLoss: '10',
    takeProfit: '20',
    maxTrades: '50',
  });
  const [botStats, setBotStats] = useState({ trades: 0, wins: 0, losses: 0, pnl: 0, currentStake: 0, consecutiveLosses: 0 });
  const [turboMode, setTurboMode] = useState(true);

  // ============================================
  // VIRTUAL HOOK STATE VARIABLES
  // ============================================
  const [hookEnabled, setHookEnabled] = useState(false);
  const [virtualLossCount, setVirtualLossCount] = useState('3');
  const [realCount, setRealCount] = useState('3');
  const [vhFakeWins, setVhFakeWins] = useState(0);
  const [vhFakeLosses, setVhFakeLosses] = useState(0);
  const [vhConsecLosses, setVhConsecLosses] = useState(0);
  const [vhStatus, setVhStatus] = useState<'idle' | 'waiting' | 'confirmed' | 'failed'>('idle');

  // Page entrance animation state
  const [pageLoaded, setPageLoaded] = useState(false);
  useEffect(() => {
    setPageLoaded(true);
  }, []);

  // Helper function to get outcome symbol for trade
  const getOutcomeSymbol = useCallback((trade: TradeRecord): string => {
    if (trade.status === 'open') return '';
    
    const digit = trade.resultDigit;
    if (digit === undefined) return '';
    
    const barrier = botConfig.prediction;
    const barrierNum = parseInt(barrier);
    
    switch (trade.type) {
      case 'CALL':
        return trade.status === 'won' ? 'R' : 'F';
      case 'PUT':
        return trade.status === 'won' ? 'F' : 'R';
      case 'DIGITOVER':
        if (trade.status === 'won') {
          if (digit > barrierNum) return 'O';
          if (digit === barrierNum) return 'S';
          return 'U';
        } else {
          if (digit <= barrierNum) return digit === barrierNum ? 'S' : 'U';
          return 'O';
        }
      case 'DIGITUNDER':
        if (trade.status === 'won') {
          if (digit < barrierNum) return 'U';
          if (digit === barrierNum) return 'S';
          return 'O';
        } else {
          if (digit >= barrierNum) return digit === barrierNum ? 'S' : 'O';
          return 'U';
        }
      case 'DIGITEVEN':
        if (trade.status === 'won') {
          return digit % 2 === 0 ? 'E' : 'O';
        } else {
          return digit % 2 !== 0 ? 'O' : 'E';
        }
      case 'DIGITODD':
        if (trade.status === 'won') {
          return digit % 2 !== 0 ? 'O' : 'E';
        } else {
          return digit % 2 === 0 ? 'E' : 'O';
        }
      case 'DIGITMATCH':
        if (trade.status === 'won') {
          return digit === barrierNum ? 'S' : 'D';
        } else {
          return digit !== barrierNum ? 'D' : 'S';
        }
      case 'DIGITDIFF':
        if (trade.status === 'won') {
          return digit !== barrierNum ? 'D' : 'S';
        } else {
          return digit === barrierNum ? 'S' : 'D';
        }
      default:
        return '';
    }
  }, [botConfig.prediction]);

  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    if (lastSpokenSignal.current === text) return;
    lastSpokenSignal.current = text;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  // ============================================
  // EXECUTE REAL TRADE FUNCTION (with TP/SL handling)
  // ============================================
  const executeRealTrade = useCallback(async (
    stakeAmount: number,
    currentPnl: number,
    isVirtual: boolean = false
  ): Promise<{ won: boolean; profit: number; newPnl: number; shouldStop: boolean }> => {
    if (!derivApi.isConnected) {
      toast.error('No connection to Deriv. Cannot execute trade.');
      return { won: false, profit: 0, newPnl: currentPnl, shouldStop: false };
    }
    
    const ct = botConfig.contractType;
    const params: any = {
      contract_type: ct,
      symbol: botConfig.botSymbol,
      duration: parseInt(botConfig.duration),
      duration_unit: botConfig.durationUnit,
      basis: 'stake',
      amount: stakeAmount,
    };
    if (['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER'].includes(ct)) {
      params.barrier = botConfig.prediction;
    }

    try {
      const { contractId } = await derivApi.buyContract(params);
      
      const tr: TradeRecord = {
        id: contractId,
        time: Date.now(),
        type: ct,
        stake: stakeAmount,
        profit: 0,
        status: 'open',
        symbol: botConfig.botSymbol,
        isVirtual,
      };
      setTradeHistory(prev => [tr, ...prev]);
      
      const result = await derivApi.waitForContractResult(contractId);
      const won = result.status === 'won';
      const profit = result.profit;
      const newPnl = currentPnl + profit;
      const resultDigit = getLastDigit(result.price || 0);
      
      setTradeHistory(prev => prev.map(t =>
        t.id === contractId
          ? { ...t, profit, status: result.status, resultDigit, outcomeSymbol: getOutcomeSymbol({ ...t, profit, status: result.status, resultDigit }) }
          : t
      ));
      
      const tpValue = parseFloat(botConfig.takeProfit);
      const slValue = parseFloat(botConfig.stopLoss);
      let shouldStop = false;
      
      if (newPnl >= tpValue) {
        showTPNotification('tp', `Take Profit Target Hit!`, newPnl);
        shouldStop = true;
        if (voiceEnabled) speak(`Take profit reached. Total profit ${newPnl.toFixed(2)} dollars`);
      }
      if (newPnl <= -slValue) {
        showTPNotification('sl', `Stop Loss Target Hit!`, Math.abs(newPnl));
        shouldStop = true;
        if (voiceEnabled) speak(`Stop loss hit. Total loss ${Math.abs(newPnl).toFixed(2)} dollars`);
      }
      
      return { won, profit, newPnl, shouldStop };
    } catch (err: any) {
      toast.error(`Trade error: ${err.message}`);
      return { won: false, profit: 0, newPnl: currentPnl, shouldStop: false };
    }
  }, [botConfig, voiceEnabled, getOutcomeSymbol]);

  // Helper function to get last digit
  const getLastDigit = (price: number): number => {
    const priceStr = price.toString();
    const match = priceStr.match(/(\d)(?:\.|$)/);
    return match ? parseInt(match[1]) : 0;
  };

  // Virtual contract simulation
  const simulateVirtualContract = useCallback(async (
    contractType: string, barrier: string, symbol: string
  ): Promise<{ won: boolean; digit: number }> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error('Virtual contract timeout'));
      }, 5000);
      
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
            case 'CALL': won = true; break;
            case 'PUT': won = false; break;
            default: won = false;
          }
          resolve({ won, digit });
        }
      });
    });
  }, []);

  const executeVirtualTrade = useCallback(async (
    currentLossCount: number,
    requiredLosses: number
  ): Promise<{ won: boolean; profit: number }> => {
    try {
      const result = await simulateVirtualContract(
        botConfig.contractType,
        botConfig.prediction,
        botConfig.botSymbol
      );
      
      const won = result.won;
      
      const virtualTrade: TradeRecord = {
        id: `virtual-${Date.now()}-${Math.random()}`,
        time: Date.now(),
        type: botConfig.contractType,
        stake: 0,
        profit: 0,
        status: won ? 'won' : 'lost',
        symbol: botConfig.botSymbol,
        resultDigit: result.digit,
        isVirtual: true,
        virtualLossCount: currentLossCount + (won ? 0 : 1),
        virtualRequired: requiredLosses,
      };
      setTradeHistory(prev => [virtualTrade, ...prev]);
      
      return { won, profit: 0 };
    } catch (err: any) {
      console.error('Virtual trade error:', err);
      const failedTrade: TradeRecord = {
        id: `virtual-failed-${Date.now()}`,
        time: Date.now(),
        type: botConfig.contractType,
        stake: 0,
        profit: 0,
        status: 'lost',
        symbol: botConfig.botSymbol,
        isVirtual: true,
        virtualLossCount: currentLossCount + 1,
        virtualRequired: requiredLosses,
      };
      setTradeHistory(prev => [failedTrade, ...prev]);
      return { won: false, profit: 0 };
    }
  }, [botConfig, simulateVirtualContract]);

  // ============================================
  // START BOT WITH VIRTUAL HOOK INTEGRATION
  // ============================================
  const startBot = useCallback(async () => {
    if (!isAuthorized) { toast.error('Login to Deriv first'); return; }
    
    if (!derivApi.isConnected) {
      toast.error('Not connected to Deriv. Please check your connection.');
      return;
    }
    
    if (refreshBalance) await refreshBalance();
    
    shouldStopRef.current = false;
    setBotRunning(true);
    setBotPaused(false);
    botRunningRef.current = true;
    botPausedRef.current = false;
    
    const baseStake = parseFloat(botConfig.stake) || 1;
    const sl = parseFloat(botConfig.stopLoss) || 10;
    const tp = parseFloat(botConfig.takeProfit) || 20;
    const maxT = parseInt(botConfig.maxTrades) || 50;
    const mart = botConfig.martingale;
    const mult = parseFloat(botConfig.multiplier) || 2;
    
    let stake = baseStake;
    let pnl = 0;
    let trades = 0;
    let wins = 0;
    let losses = 0;
    let consLosses = 0;
    
    setVhFakeWins(0);
    setVhFakeLosses(0);
    setVhConsecLosses(0);
    setVhStatus('idle');

    if (voiceEnabled) speak('Auto trading bot started');

    while (botRunningRef.current && !shouldStopRef.current) {
      if (botPausedRef.current) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      
      if (trades >= maxT || pnl <= -sl || pnl >= tp) {
        const reason = trades >= maxT ? 'Max trades reached' : pnl <= -sl ? 'Stop loss hit' : 'Take profit reached';
        toast.info(`🤖 Bot stopped: ${reason}`);
        break;
      }

      if (hookEnabled) {
        setVhStatus('waiting');
        let consecLossesHook = 0;
        const requiredLosses = parseInt(virtualLossCount) || 3;
        const realTradesCount = parseInt(realCount) || 2;

        while (consecLossesHook < requiredLosses && botRunningRef.current && !shouldStopRef.current) {
          if (voiceEnabled && (consecLossesHook % 3 === 0 || consecLossesHook === requiredLosses - 1)) {
            speak(`Virtual trade, losses ${consecLossesHook} of ${requiredLosses}`);
          }
          
          try {
            const vResult = await executeVirtualTrade(consecLossesHook, requiredLosses);
            
            if (!botRunningRef.current || shouldStopRef.current) break;

            if (vResult.won) {
              consecLossesHook = 0;
              setVhConsecLosses(0);
              setVhFakeWins(prev => prev + 1);
            } else {
              consecLossesHook++;
              setVhConsecLosses(consecLossesHook);
              setVhFakeLosses(prev => prev + 1);
            }
            
            await new Promise(r => setTimeout(r, 200));
          } catch (err) {
            console.error('Virtual simulation error:', err);
            break;
          }
        }

        if (!botRunningRef.current || shouldStopRef.current) break;

        setVhStatus('confirmed');
        
        if (voiceEnabled) {
          speak(`Virtual hook confirmed after ${consecLossesHook} losses. Starting ${realTradesCount} real trades.`);
        }

        let winOccurred = false;
        
        for (let ri = 0; ri < realTradesCount && botRunningRef.current && !winOccurred && !shouldStopRef.current; ri++) {
          if (!derivApi.isConnected) {
            toast.error('Connection lost. Stopping bot.');
            shouldStopRef.current = true;
            break;
          }
          
          const result = await executeRealTrade(stake, pnl, false);
          
          trades++;
          pnl = result.newPnl;
          
          if (result.won) {
            wins++;
            consLosses = 0;
            winOccurred = true;
            stake = baseStake;
            if (voiceEnabled) speak(`Hook trade ${ri + 1} won. Total profit ${pnl.toFixed(2)}`);
            toast.success(`✅ Hook trade WIN! Exiting hook mode.`);
          } else {
            losses++;
            consLosses++;
            if (mart) {
              stake = Math.round(stake * mult * 100) / 100;
            }
            if (voiceEnabled) speak(`Hook trade ${ri + 1} loss. ${mart ? `New stake ${stake.toFixed(2)}` : ''}`);
          }
          
          setBotStats({ trades, wins, losses, pnl, currentStake: stake, consecutiveLosses: consLosses });
          
          if (result.shouldStop) {
            shouldStopRef.current = true;
            break;
          }
          
          if (!turboMode && ri < realTradesCount - 1 && !winOccurred) {
            await new Promise(r => setTimeout(r, 400));
          }
        }
        
        setVhStatus('idle');
        setVhConsecLosses(0);
        
        if (!turboMode && !shouldStopRef.current) {
          await new Promise(r => setTimeout(r, 500));
        }
        
        continue;
      }

      if (!derivApi.isConnected) {
        toast.error('Connection lost. Stopping bot.');
        break;
      }
      
      const result = await executeRealTrade(stake, pnl, false);
      
      trades++;
      pnl = result.newPnl;
      
      if (result.won) {
        wins++;
        consLosses = 0;
        stake = baseStake;
        if (voiceEnabled && trades % 5 === 0) speak(`Trade ${trades} won. Total profit ${pnl.toFixed(2)}`);
      } else {
        losses++;
        consLosses++;
        if (mart) {
          stake = Math.round(stake * mult * 100) / 100;
        } else {
          stake = baseStake;
        }
        if (voiceEnabled) speak(`Loss ${consLosses}. ${mart ? `Martingale stake ${stake.toFixed(2)}` : ''}`);
      }
      
      setBotStats({ trades, wins, losses, pnl, currentStake: stake, consecutiveLosses: consLosses });
      
      if (result.shouldStop) {
        shouldStopRef.current = true;
        break;
      }
      
      if (!turboMode) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
    
    setBotRunning(false);
    botRunningRef.current = false;
    setVhStatus('idle');
    shouldStopRef.current = false;
    setBotStats(prev => ({ ...prev, trades, wins, losses, pnl }));
    
    if (voiceEnabled && (pnl <= -sl || pnl >= tp)) {
      speak(`Bot stopped. Final profit ${pnl.toFixed(2)} dollars`);
    }
  }, [isAuthorized, botConfig, voiceEnabled, speak, hookEnabled, virtualLossCount, realCount, executeRealTrade, executeVirtualTrade, turboMode, refreshBalance]);

  const stopBot = useCallback(() => {
    shouldStopRef.current = true;
    botRunningRef.current = false;
    setBotRunning(false);
    setVhStatus('idle');
    toast.info('🛑 Bot stopped');
  }, []);
  
  const togglePauseBot = useCallback(() => {
    botPausedRef.current = !botPausedRef.current;
    setBotPaused(botPausedRef.current);
    toast.info(botPausedRef.current ? '⏸ Bot paused' : '▶ Bot resumed');
  }, []);

  const handleBotSymbolChange = useCallback((newSymbol: string) => {
    setBotConfig(prev => ({ ...prev, botSymbol: newSymbol }));
    setSymbol(newSymbol);
  }, []);

  const totalTrades = tradeHistory.filter(t => t.status !== 'open' && !t.isVirtual).length;
  const winsCount = tradeHistory.filter(t => t.status === 'won' && !t.isVirtual).length;
  const lossesCount = tradeHistory.filter(t => t.status === 'lost' && !t.isVirtual).length;
  const totalProfit = tradeHistory.filter(t => !t.isVirtual).reduce((s, t) => s + t.profit, 0);
  const winRate = totalTrades > 0 ? (winsCount / totalTrades * 100) : 0;

  return (
    <motion.div 
      className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: pageLoaded ? 1 : 0 }}
      transition={{ duration: 0.5 }}
    >
      <style>{notificationStyles}</style>
      
      <TPSLNotificationPopup />
      
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div 
          variants={fadeInUpVariants}
          initial="hidden"
          animate={pageLoaded ? "visible" : "hidden"}
          className="mb-6 text-center"
        >
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent flex items-center justify-center gap-2">
            <Zap className="w-7 h-7 text-emerald-400" />
            Ramzfx Speed Bot
            <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
          </h1>
          <p className="text-slate-400 text-sm mt-1">Automated Trading Terminal • Real-time Execution</p>
        </motion.div>

        {/* Main Bot Card */}
        <motion.div 
          variants={fadeInUpVariants}
          initial="hidden"
          animate={pageLoaded ? "visible" : "hidden"}
          transition={{ delay: 0.1 }}
          className={`bg-slate-900/80 backdrop-blur-sm border rounded-2xl p-5 shadow-2xl transition-all duration-300 ${
            botRunning ? 'border-emerald-500/50 shadow-emerald-500/20' : 'border-slate-700'
          }`}
        >
          {/* Header Controls */}
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5 pb-3 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ${
                derivApi.isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {derivApi.isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span className="font-medium">{derivApi.isConnected ? 'Live' : 'Offline'}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => refreshBalance?.()}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Balance
              </Button>
              <Button
                size="sm"
                variant={voiceEnabled ? 'default' : 'outline'}
                className={`gap-1.5 ${voiceEnabled ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-slate-700 text-slate-300'}`}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
              >
                {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                Voice
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={turboMode ? 'default' : 'outline'}
                className={`gap-1.5 ${turboMode ? 'bg-amber-500 hover:bg-amber-600 text-black font-bold' : 'border-slate-700'}`}
                onClick={() => setTurboMode(!turboMode)}
                disabled={botRunning}
              >
                <Zap className="w-3.5 h-3.5" />
                {turboMode ? '⚡ TURBO' : 'Turbo'}
              </Button>
              {botRunning && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 animate-pulse">
                  RUNNING
                </Badge>
              )}
            </div>
          </div>

          {/* Bot Configuration Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Market Symbol</label>
              <Select value={botConfig.botSymbol} onValueChange={handleBotSymbolChange} disabled={botRunning}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                  {ALL_MARKETS.map(m => (
                    <SelectItem key={m.symbol} value={m.symbol} className="text-slate-200">
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">Contract Type</label>
              <Select value={botConfig.contractType} onValueChange={v => setBotConfig(p => ({ ...p, contractType: v }))} disabled={botRunning}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {CONTRACT_TYPES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {['DIGITMATCH','DIGITDIFF','DIGITOVER','DIGITUNDER'].includes(botConfig.contractType) && (
              <div>
                <label className="text-xs text-slate-400 block mb-1">Prediction Digit (0-9)</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 10 }, (_, i) => (
                    <button 
                      key={i} 
                      disabled={botRunning} 
                      onClick={() => setBotConfig(p => ({ ...p, prediction: String(i) }))}
                      className={`h-9 rounded-lg text-sm font-mono font-bold transition-all ${
                        botConfig.prediction === String(i) 
                          ? 'bg-emerald-500 text-white' 
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Stake ($)</label>
                <Input type="number" min="0.35" step="0.01" value={botConfig.stake}
                  onChange={e => setBotConfig(p => ({ ...p, stake: e.target.value }))} disabled={botRunning}
                  className="bg-slate-800 border-slate-700 text-slate-200 h-10" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Duration</label>
                <div className="flex gap-2">
                  <Input type="number" min="1" value={botConfig.duration}
                    onChange={e => setBotConfig(p => ({ ...p, duration: e.target.value }))} disabled={botRunning}
                    className="bg-slate-800 border-slate-700 text-slate-200 h-10 flex-1" />
                  <Select value={botConfig.durationUnit} onValueChange={v => setBotConfig(p => ({ ...p, durationUnit: v }))} disabled={botRunning}>
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-200 w-20 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="t">Ticks</SelectItem>
                      <SelectItem value="s">Seconds</SelectItem>
                      <SelectItem value="m">Minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-800/50 rounded-xl p-3">
              <div>
                <span className="text-xs text-slate-400">Martingale</span>
                <p className="text-[10px] text-slate-500 mt-0.5">Double on loss</p>
              </div>
              <div className="flex items-center gap-3">
                {botConfig.martingale && (
                  <Input type="number" min="1.1" step="0.1" value={botConfig.multiplier}
                    onChange={e => setBotConfig(p => ({ ...p, multiplier: e.target.value }))} disabled={botRunning}
                    className="bg-slate-800 border-slate-700 text-slate-200 h-8 w-20 text-sm" />
                )}
                <Switch checked={botConfig.martingale} onCheckedChange={v => setBotConfig(p => ({ ...p, martingale: v }))} disabled={botRunning} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Stop Loss</label>
                <Input type="number" value={botConfig.stopLoss} onChange={e => setBotConfig(p => ({ ...p, stopLoss: e.target.value }))}
                  disabled={botRunning} className="bg-slate-800 border-slate-700 text-slate-200 h-10" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Take Profit</label>
                <Input type="number" value={botConfig.takeProfit} onChange={e => setBotConfig(p => ({ ...p, takeProfit: e.target.value }))}
                  disabled={botRunning} className="bg-slate-800 border-slate-700 text-slate-200 h-10" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Max Trades</label>
                <Input type="number" value={botConfig.maxTrades} onChange={e => setBotConfig(p => ({ ...p, maxTrades: e.target.value }))}
                  disabled={botRunning} className="bg-slate-800 border-slate-700 text-slate-200 h-10" />
              </div>
            </div>

            {/* Virtual Hook Section */}
            <div className="md:col-span-2 border-t border-slate-700 pt-3 mt-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <Anchor className="w-4 h-4" /> Virtual Hook Strategy
                </label>
                <Switch checked={hookEnabled} onCheckedChange={setHookEnabled} disabled={botRunning} />
              </div>

              {hookEnabled && (
                <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400">Required V-Losses</label>
                      <Input type="number" min="1" max="20" value={virtualLossCount}
                        onChange={e => setVirtualLossCount(e.target.value)} disabled={botRunning}
                        className="bg-slate-800 border-slate-700 h-8 text-sm mt-1" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Real Trades (max)</label>
                      <Input type="number" min="1" max="10" value={realCount}
                        onChange={e => setRealCount(e.target.value)} disabled={botRunning}
                        className="bg-slate-800 border-slate-700 h-8 text-sm mt-1" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-800/50 rounded-lg p-1.5">
                      <div className="text-[9px] text-slate-400">V-Win</div>
                      <div className="font-mono text-sm font-bold text-emerald-400">{vhFakeWins}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-1.5">
                      <div className="text-[9px] text-slate-400">V-Loss</div>
                      <div className="font-mono text-sm font-bold text-red-400">{vhFakeLosses}</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-1.5">
                      <div className="text-[9px] text-slate-400">Streak</div>
                      <div className="font-mono text-sm font-bold text-amber-400">{vhConsecLosses}</div>
                    </div>
                  </div>
                  
                  {vhStatus === 'waiting' && botRunning && (
                    <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-1.5 text-[10px] text-emerald-400 animate-pulse text-center">
                      🎣 Waiting for {virtualLossCount} consecutive virtual losses... ({vhConsecLosses}/{virtualLossCount})
                    </div>
                  )}
                  {vhStatus === 'confirmed' && botRunning && (
                    <div className="bg-emerald-500/20 border border-emerald-500 rounded-lg p-1.5 text-[10px] text-emerald-300 text-center font-bold">
                      ✅ Hook confirmed! Executing real trades...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Running Stats */}
          {botRunning && (
            <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-slate-800/40 rounded-xl">
              <div className="text-center">
                <div className="text-[9px] text-slate-400">Current Stake</div>
                <div className="font-mono text-lg font-bold text-emerald-400">${botStats.currentStake.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-slate-400">Loss Streak</div>
                <div className="font-mono text-lg font-bold text-red-400">{botStats.consecutiveLosses}</div>
              </div>
              <div className={`text-center ${botStats.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                <div className="text-[9px] text-slate-400">P/L</div>
                <div className="font-mono text-lg font-bold">{botStats.pnl >= 0 ? '+' : ''}{botStats.pnl.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex gap-3 mt-2">
            {!botRunning ? (
              <Button onClick={startBot} disabled={!isAuthorized} className="flex-1 h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white">
                <Play className="w-5 h-5 mr-2" /> Start Bot
              </Button>
            ) : (
              <>
                <Button onClick={togglePauseBot} variant="outline" className="flex-1 h-12 text-base border-slate-600 text-slate-300 hover:bg-slate-800">
                  <Pause className="w-4 h-4 mr-2" /> {botPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button onClick={stopBot} variant="destructive" className="flex-1 h-12 text-base">
                  <StopCircle className="w-5 h-5 mr-2" /> Stop
                </Button>
              </>
            )}
          </div>
        </motion.div>

        {/* Trade History Panel */}
        <motion.div 
          variants={fadeInUpVariants}
          initial="hidden"
          animate={pageLoaded ? "visible" : "hidden"}
          transition={{ delay: 0.2 }}
          className="mt-6 bg-slate-900/60 backdrop-blur-sm border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-400" /> Trade History
            </h3>
            {tradeHistory.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-slate-400 hover:text-red-400"
                onClick={() => { setTradeHistory([]); setBotStats({ trades: 0, wins: 0, losses: 0, pnl: 0, currentStake: 0, consecutiveLosses: 0 }); }}>
                Clear
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-4 gap-2 mb-3">
            <div className="bg-slate-800/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Trades</div>
              <div className="font-mono text-base font-bold">{totalTrades}</div>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-2 text-center">
              <div className="text-[9px] text-emerald-400">Wins</div>
              <div className="font-mono text-base font-bold text-emerald-400">{winsCount}</div>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2 text-center">
              <div className="text-[9px] text-red-400">Losses</div>
              <div className="font-mono text-base font-bold text-red-400">{lossesCount}</div>
            </div>
            <div className={`${totalProfit >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'} rounded-lg p-2 text-center`}>
              <div className="text-[9px] text-slate-400">P/L</div>
              <div className={`font-mono text-base font-bold ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
              </div>
            </div>
          </div>
          
          {totalTrades > 0 && (
            <div className="mb-3">
              <div className="flex justify-between text-[9px] text-slate-400 mb-0.5">
                <span>Win Rate</span>
                <span className="font-mono">{winRate.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${winRate}%` }} />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            <AnimatePresence>
              {tradeHistory.map(t => {
                const outcomeSymbol = getOutcomeSymbol(t);
                let badgeColor = '';
                if (outcomeSymbol === 'R' || outcomeSymbol === 'U') badgeColor = 'border-emerald-500 text-emerald-400';
                else if (outcomeSymbol === 'F' || outcomeSymbol === 'O') badgeColor = 'border-red-500 text-red-400';
                else if (outcomeSymbol === 'S') badgeColor = 'border-blue-500 text-blue-400';
                else if (outcomeSymbol === 'D') badgeColor = 'border-amber-500 text-amber-400';
                else if (outcomeSymbol === 'E') badgeColor = 'border-emerald-500 text-emerald-400';
                
                return (
                  <motion.div 
                    key={t.id} 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className={`flex items-center justify-between text-xs p-2 rounded-lg border ${
                      t.status === 'open' ? 'border-blue-500/30 bg-blue-500/5' :
                      t.status === 'won' ? 'border-emerald-500/30 bg-emerald-500/5' :
                      'border-red-500/30 bg-red-500/5'
                    } ${t.isVirtual ? 'border-dashed opacity-80' : ''}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold ${t.status === 'won' ? 'text-emerald-400' : t.status === 'lost' ? 'text-red-400' : 'text-blue-400'}`}>
                        {t.status === 'open' ? '⏳' : t.status === 'won' ? '✅' : '❌'}
                      </span>
                      {t.isVirtual && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 bg-purple-500/20 text-purple-300 border-purple-500/30">
                          VIRTUAL
                        </Badge>
                      )}
                      <span className="font-mono text-slate-300">{t.type}</span>
                      {!t.isVirtual && t.stake > 0 && <span className="text-slate-400">${t.stake.toFixed(2)}</span>}
                      {t.resultDigit !== undefined && (
                        <Badge variant="outline" className={`text-[9px] px-1.5 ${t.status === 'won' ? 'border-emerald-500 text-emerald-400' : 'border-red-500 text-red-400'}`}>
                          {t.resultDigit}
                        </Badge>
                      )}
                      {outcomeSymbol && t.status !== 'open' && (
                        <Badge variant="outline" className={`text-[9px] px-1.5 font-mono ${badgeColor}`}>
                          {outcomeSymbol}
                        </Badge>
                      )}
                    </div>
                    <span className={`font-mono font-bold ${t.isVirtual ? (t.status === 'won' ? 'text-emerald-400' : 'text-red-400') : (t.profit >= 0 ? 'text-emerald-400' : 'text-red-400')}`}>
                      {t.status === 'open' ? '...' : t.isVirtual ? (t.status === 'won' ? 'WIN' : 'LOSS') : `${t.profit >= 0 ? '+' : ''}$${t.profit.toFixed(2)}`}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {tradeHistory.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No trades yet. Start the bot to see results.
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
