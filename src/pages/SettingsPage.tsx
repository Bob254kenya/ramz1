// src/components/bots/MultiStrategyBot.tsx

import { useState, useRef, useCallback, useEffect } from 'react';
import { derivApi, type MarketSymbol } from '@/services/deriv-api';
import { copyTradingService } from '@/services/copy-trading-service';
import { getLastDigit } from '@/services/analysis';
import { useAuth } from '@/contexts/AuthContext';
import { useLossRequirement } from '@/hooks/useLossRequirement';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play, StopCircle, Trash2, Scan, TrendingUp, TrendingDown,
  Activity, BarChart3, Brain, Zap, Shield, DollarSign, EyeOff, Eye,
  Volume2, VolumeX, Settings, Target, AlertCircle, CheckCircle2,
  Sparkles, Flame, Gauge, ArrowUp, ArrowDown, CircleDot, Filter,
  ChevronDown, ChevronUp, Layers
} from 'lucide-react';

// ============================================
// STYLES
// ============================================

const botStyles = `
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.6; filter: blur(4px); }
  50% { opacity: 1; filter: blur(2px); }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes bounce-up {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

@keyframes rotate-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes blink-green {
  0%, 100% { border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.05); }
  50% { border-color: rgba(16, 185, 129, 0.8); background: rgba(16, 185, 129, 0.15); }
}

@keyframes blink-red {
  0%, 100% { border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); }
  50% { border-color: rgba(239, 68, 68, 0.8); background: rgba(239, 68, 68, 0.15); }
}

.animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
.animate-slideIn { animation: slideIn 0.3s ease-out forwards; }
.animate-bounce-up { animation: bounce-up 0.5s ease-in-out infinite; }
.animate-shimmer { animation: shimmer 2s infinite; }
.animate-rotate-slow { animation: rotate-slow 3s linear infinite; }
.animate-blink-green { animation: blink-green 0.8s ease-in-out 2; }
.animate-blink-red { animation: blink-red 0.8s ease-in-out 2; }
`;

// ============================================
// TYPES
// ============================================

type StrategyType = 
  | 'trend_over_under'
  | 'even_odd_momentum'
  | 'digit_reversal'
  | 'bollinger_pressure'
  | 'parabolic_sar'
  | 'smart_combo';

type DirectionType = 'OVER' | 'UNDER' | 'EVEN' | 'ODD';
type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK';

// New: Direction Filter Type
type DirectionFilter = 'ALL' | 'OVER_UNDER_ONLY' | 'EVEN_ODD_ONLY';

interface Signal {
  direction: DirectionType;
  confidence: number;
  strength: SignalStrength;
  reasons: string[];
}

interface MarketData {
  symbol: string;
  name: string;
  lastDigits: number[];
  timestamps: number[];
  prices: number[];
  sma5: number;
  sma10: number;
  sma20: number;
  rsi: number;
  bollingerUpper: number;
  bollingerLower: number;
  bollingerMiddle: number;
  parabolicSar: number;
  evenCount: number;
  oddCount: number;
  overCount: number;
  underCount: number;
  lastUpdate: number;
}

interface LogEntry {
  id: number;
  time: string;
  strategy: string;
  symbol: string;
  direction: string;
  stake: number;
  martingaleStep: number;
  result: 'Win' | 'Loss' | 'Pending';
  pnl: number;
  balance: number;
  confidence: number;
}

interface StrategyConfig {
  enabled: boolean;
  minConfidence: number;
  requireConfirmation: boolean;
}

// New: Entry Threshold Configuration
interface EntryThresholds {
  strongEntry: number;      // 70+ confidence - immediate entry
  moderateEntry: number;    // 55-69 confidence - normal entry
  minEntry: number;         // Minimum confidence to consider
  requireMultipleSignals: boolean;  // Require multiple strategies to agree
}

// ============================================
// CONSTANTS
// ============================================

const TRADING_MARKETS = [
  { symbol: 'R_10', name: 'Vol 10', color: 'emerald' },
  { symbol: 'R_25', name: 'Vol 25', color: 'cyan' },
  { symbol: 'R_50', name: 'Vol 50', color: 'indigo' },
  { symbol: 'R_75', name: 'Vol 75', color: 'rose' },
  { symbol: 'R_100', name: 'Vol 100', color: 'amber' },
  { symbol: '1HZ10V', name: 'V10 1s', color: 'green' },
  { symbol: '1HZ25V', name: 'V25 1s', color: 'blue' },
  { symbol: '1HZ50V', name: 'V50 1s', color: 'purple' },
  { symbol: '1HZ100V', name: 'V100 1s', color: 'fuchsia' },
];

const DIGIT_HISTORY_SIZE = 100;
const PRICE_HISTORY_SIZE = 50;
const SCAN_INTERVAL_MS = 500;
const MAX_SCAN_ATTEMPTS = 50;
const MIN_DIGITS_FOR_ANALYSIS = 20;
const SMA_PERIODS = { short: 5, medium: 10, long: 20 };
const RSI_PERIODS = 14;
const BOLLINGER_PERIODS = 20;
const BOLLINGER_STD = 2;

// ============================================
// UTILITY FUNCTIONS
// ============================================

const calculateSMA = (prices: number[], period: number): number => {
  if (prices.length < period) return prices[prices.length - 1] || 0;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
};

const calculateRSI = (prices: number[], period: number = 14): number => {
  if (prices.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calculateBollingerBands = (prices: number[], period: number, stdDev: number) => {
  const sma = calculateSMA(prices, period);
  const variance = prices.slice(-period).reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    upper: sma + (standardDeviation * stdDev),
    middle: sma,
    lower: sma - (standardDeviation * stdDev)
  };
};

const calculateParabolicSAR = (prices: number[], highPrices: number[], lowPrices: number[]): number => {
  if (prices.length < 5) return prices[prices.length - 1] || 0;
  
  const lastPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];
  const trend = lastPrice > prevPrice ? 1 : -1;
  const acceleration = 0.02;
  const maxAcceleration = 0.2;
  
  let sar = prevPrice + acceleration * trend * (lastPrice - prevPrice);
  sar = Math.min(Math.max(sar, Math.min(...lowPrices.slice(-5))), Math.max(...highPrices.slice(-5)));
  
  return sar;
};

// ============================================
// ENHANCED STRATEGY 1: TREND-BASED OVER/UNDER
// ============================================

class TrendOverUnderStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { sma5, sma10, prices, lastDigits } = data;
    const currentPrice = prices[prices.length - 1] || 0;
    
    const reasons: string[] = [];
    let overConfidence = 0;
    let underConfidence = 0;
    
    // Enhanced SMA Trend Analysis with multiple timeframes
    const isAboveSMA5 = currentPrice > sma5;
    const isAboveSMA10 = currentPrice > sma10;
    const bullAlign = isAboveSMA5 && isAboveSMA10;
    const bearAlign = !isAboveSMA5 && !isAboveSMA10;
    
    // Check SMA slope
    if (prices.length >= 10) {
      const sma5Prev = calculateSMA(prices.slice(0, -5), 5);
      const smaSlope = sma5 - sma5Prev;
      if (smaSlope > 0 && bullAlign) {
        overConfidence += 15;
        reasons.push('SMA5 slope rising');
      } else if (smaSlope < 0 && bearAlign) {
        underConfidence += 15;
        reasons.push('SMA5 slope falling');
      }
    }
    
    if (bullAlign) {
      overConfidence += 35;
      reasons.push('Price above both SMAs (strong bullish)');
    } else if (bearAlign) {
      underConfidence += 35;
      reasons.push('Price below both SMAs (strong bearish)');
    } else if (isAboveSMA5) {
      overConfidence += 20;
      reasons.push('Price above short-term SMA');
    } else if (!isAboveSMA5) {
      underConfidence += 20;
      reasons.push('Price below short-term SMA');
    }
    
    // Enhanced Digit Flow Analysis
    if (lastDigits.length >= 20) {
      const recentDigits = lastDigits.slice(-20);
      const overDigits = recentDigits.filter(d => d >= 5).length;
      const underDigits = recentDigits.filter(d => d <= 4).length;
      const overPercent = (overDigits / 20) * 100;
      const underPercent = (underDigits / 20) * 100;
      
      // Strong dominance
      if (overPercent >= 70) {
        overConfidence += 40;
        reasons.push(`STRONG OVER dominance: ${overPercent.toFixed(0)}%`);
      } else if (overPercent >= 60) {
        overConfidence += 25;
        reasons.push(`${overPercent.toFixed(0)}% OVER digits in last 20`);
      } else if (underPercent >= 70) {
        underConfidence += 40;
        reasons.push(`STRONG UNDER dominance: ${underPercent.toFixed(0)}%`);
      } else if (underPercent >= 60) {
        underConfidence += 25;
        reasons.push(`${underPercent.toFixed(0)}% UNDER digits in last 20`);
      }
      
      // Extended consecutive pattern detection
      let longestOverStreak = 0, currentOverStreak = 0;
      let longestUnderStreak = 0, currentUnderStreak = 0;
      
      for (const digit of recentDigits) {
        if (digit >= 5) {
          currentOverStreak++;
          currentUnderStreak = 0;
          longestOverStreak = Math.max(longestOverStreak, currentOverStreak);
        } else {
          currentUnderStreak++;
          currentOverStreak = 0;
          longestUnderStreak = Math.max(longestUnderStreak, currentUnderStreak);
        }
      }
      
      if (longestOverStreak >= 4) {
        overConfidence += 25;
        reasons.push(`${longestOverStreak}+ consecutive OVER digits`);
      } else if (longestOverStreak >= 3) {
        overConfidence += 15;
        reasons.push(`${longestOverStreak} consecutive OVER digits`);
      }
      
      if (longestUnderStreak >= 4) {
        underConfidence += 25;
        reasons.push(`${longestUnderStreak}+ consecutive UNDER digits`);
      } else if (longestUnderStreak >= 3) {
        underConfidence += 15;
        reasons.push(`${longestUnderStreak} consecutive UNDER digits`);
      }
      
      // Momentum: last 5 vs previous 5
      const last5 = recentDigits.slice(-5).filter(d => d >= 5).length;
      const prev5 = recentDigits.slice(-10, -5).filter(d => d >= 5).length;
      if (last5 > prev5 + 2) {
        overConfidence += 15;
        reasons.push('Increasing OVER momentum');
      } else if (prev5 > last5 + 2) {
        underConfidence += 15;
        reasons.push('Increasing UNDER momentum');
      }
    }
    
    let direction: DirectionType | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = Math.min(overConfidence, 100);
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = Math.min(underConfidence, 100);
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 55 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// ENHANCED STRATEGY 2: EVEN/ODD MOMENTUM
// ============================================

class EvenOddMomentumStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { lastDigits, rsi, prices } = data;
    const reasons: string[] = [];
    let evenConfidence = 0;
    let oddConfidence = 0;
    
    // Enhanced Digit Distribution Analysis
    if (lastDigits.length >= 20) {
      const recentDigits = lastDigits.slice(-20);
      const evenDigits = recentDigits.filter(d => d % 2 === 0).length;
      const oddDigits = recentDigits.filter(d => d % 2 !== 0).length;
      const evenPercent = (evenDigits / 20) * 100;
      const oddPercent = (oddDigits / 20) * 100;
      
      if (evenPercent >= 75) {
        evenConfidence += 50;
        reasons.push(`EXTREME EVEN dominance: ${evenPercent.toFixed(0)}%`);
      } else if (evenPercent >= 65) {
        evenConfidence += 35;
        reasons.push(`High EVEN dominance: ${evenPercent.toFixed(0)}%`);
      } else if (evenPercent >= 55) {
        evenConfidence += 20;
        reasons.push(`${evenPercent.toFixed(0)}% EVEN digits`);
      }
      
      if (oddPercent >= 75) {
        oddConfidence += 50;
        reasons.push(`EXTREME ODD dominance: ${oddPercent.toFixed(0)}%`);
      } else if (oddPercent >= 65) {
        oddConfidence += 35;
        reasons.push(`High ODD dominance: ${oddPercent.toFixed(0)}%`);
      } else if (oddPercent >= 55) {
        oddConfidence += 20;
        reasons.push(`${oddPercent.toFixed(0)}% ODD digits`);
      }
      
      // Consecutive pattern analysis
      let longestEvenStreak = 0, currentEvenStreak = 0;
      let longestOddStreak = 0, currentOddStreak = 0;
      
      for (const digit of recentDigits) {
        if (digit % 2 === 0) {
          currentEvenStreak++;
          currentOddStreak = 0;
          longestEvenStreak = Math.max(longestEvenStreak, currentEvenStreak);
        } else {
          currentOddStreak++;
          currentEvenStreak = 0;
          longestOddStreak = Math.max(longestOddStreak, currentOddStreak);
        }
      }
      
      if (longestEvenStreak >= 4) {
        evenConfidence += 30;
        reasons.push(`${longestEvenStreak}+ consecutive EVEN digits`);
      } else if (longestEvenStreak >= 3) {
        evenConfidence += 20;
        reasons.push(`${longestEvenStreak} consecutive EVEN digits`);
      }
      
      if (longestOddStreak >= 4) {
        oddConfidence += 30;
        reasons.push(`${longestOddStreak}+ consecutive ODD digits`);
      } else if (longestOddStreak >= 3) {
        oddConfidence += 20;
        reasons.push(`${longestOddStreak} consecutive ODD digits`);
      }
    }
    
    // Enhanced RSI Momentum Confirmation
    if (rsi >= 65) {
      evenConfidence += 25;
      reasons.push(`Strong RSI ${rsi.toFixed(0)} (overbought momentum)`);
    } else if (rsi >= 55) {
      evenConfidence += 15;
      reasons.push(`RSI ${rsi.toFixed(0)} supports upward momentum`);
    } else if (rsi <= 35) {
      oddConfidence += 25;
      reasons.push(`Weak RSI ${rsi.toFixed(0)} (oversold pressure)`);
    } else if (rsi <= 45) {
      oddConfidence += 15;
      reasons.push(`RSI ${rsi.toFixed(0)} suggests downward pressure`);
    }
    
    // Enhanced Price action
    if (prices.length >= 5) {
      const recentChange = ((prices[prices.length - 1] - prices[prices.length - 5]) / prices[prices.length - 5]) * 100;
      if (recentChange > 0.5) {
        evenConfidence += 20;
        reasons.push(`Rising price (+${recentChange.toFixed(1)}%)`);
      } else if (recentChange > 0.1) {
        evenConfidence += 10;
        reasons.push('Slight price increase');
      } else if (recentChange < -0.5) {
        oddConfidence += 20;
        reasons.push(`Falling price (${recentChange.toFixed(1)}%)`);
      } else if (recentChange < -0.1) {
        oddConfidence += 10;
        reasons.push('Slight price decrease');
      }
    }
    
    // Specific digit patterns
    if (lastDigits.length >= 5) {
      const last5 = lastDigits.slice(-5);
      const patternCheck = last5.join('');
      // Look for alternating patterns that might predict next digit
      const alternatingEvenOdd = last5.every((d, i) => i === 0 || (d % 2 !== last5[i-1] % 2));
      if (alternatingEvenOdd) {
        const lastWasEven = last5[last5.length-1] % 2 === 0;
        if (lastWasEven) {
          oddConfidence += 15;
          reasons.push('Alternating pattern suggests ODD next');
        } else {
          evenConfidence += 15;
          reasons.push('Alternating pattern suggests EVEN next');
        }
      }
    }
    
    let direction: DirectionType | null = null;
    let confidence = 0;
    
    if (evenConfidence > oddConfidence && evenConfidence >= this.config.minConfidence) {
      direction = 'EVEN';
      confidence = Math.min(evenConfidence, 100);
    } else if (oddConfidence > evenConfidence && oddConfidence >= this.config.minConfidence) {
      direction = 'ODD';
      confidence = Math.min(oddConfidence, 100);
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 55 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// ENHANCED STRATEGY 3: DIGIT REVERSAL
// ============================================

class DigitReversalStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { lastDigits } = data;
    const reasons: string[] = [];
    let overConfidence = 0;
    let underConfidence = 0;
    
    if (lastDigits.length < 15) return null;
    
    const recentDigits = lastDigits.slice(-15);
    
    // Enhanced streak detection for OVER
    const overStreakLength = this.getConsecutiveStreak(recentDigits, true);
    if (overStreakLength >= 5) {
      underConfidence += 60;
      reasons.push(`LONG OVER streak (${overStreakLength}), high probability UNDER reversal`);
    } else if (overStreakLength >= 4) {
      underConfidence += 45;
      reasons.push(`${overStreakLength} OVER streak, expecting UNDER`);
    } else if (overStreakLength >= 3) {
      underConfidence += 25;
      reasons.push(`${overStreakLength}+ OVER streak, likely UNDER reversal`);
    }
    
    // Enhanced streak detection for UNDER
    const underStreakLength = this.getConsecutiveStreak(recentDigits, false);
    if (underStreakLength >= 5) {
      overConfidence += 60;
      reasons.push(`LONG UNDER streak (${underStreakLength}), high probability OVER reversal`);
    } else if (underStreakLength >= 4) {
      overConfidence += 45;
      reasons.push(`${underStreakLength} UNDER streak, expecting OVER`);
    } else if (underStreakLength >= 3) {
      overConfidence += 25;
      reasons.push(`${underStreakLength}+ UNDER streak, likely OVER reversal`);
    }
    
    // Extreme digit detection
    const lastDigit = recentDigits[recentDigits.length - 1];
    if (lastDigit === 0) {
      overConfidence += 35;
      reasons.push('Digit 0 (extreme low) → STRONG reversal expected UP');
    } else if (lastDigit === 1) {
      overConfidence += 20;
      reasons.push('Digit 1 (very low) → likely reversal up');
    } else if (lastDigit === 9) {
      underConfidence += 35;
      reasons.push('Digit 9 (extreme high) → STRONG reversal expected DOWN');
    } else if (lastDigit === 8) {
      underConfidence += 20;
      reasons.push('Digit 8 (very high) → likely reversal down');
    }
    
    // Pattern exhaustion - two same extremes in a row
    if (recentDigits.length >= 2 && recentDigits[recentDigits.length - 1] === recentDigits[recentDigits.length - 2]) {
      const lastTwo = recentDigits[recentDigits.length - 1];
      if (lastTwo <= 1) {
        overConfidence += 25;
        reasons.push(`Double ${lastTwo} (extreme low), strong reversal signal`);
      } else if (lastTwo >= 8) {
        underConfidence += 25;
        reasons.push(`Double ${lastTwo} (extreme high), strong reversal signal`);
      }
    }
    
    // Mean reversion from recent extreme values
    const last5Avg = recentDigits.slice(-5).reduce((a, b) => a + b, 0) / 5;
    if (last5Avg <= 2) {
      overConfidence += 20;
      reasons.push(`Recent average digit ${last5Avg.toFixed(1)} (very low), mean reversion up`);
    } else if (last5Avg >= 7) {
      underConfidence += 20;
      reasons.push(`Recent average digit ${last5Avg.toFixed(1)} (very high), mean reversion down`);
    }
    
    let direction: DirectionType | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = Math.min(overConfidence, 100);
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = Math.min(underConfidence, 100);
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 55 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
  
  private getConsecutiveStreak(digits: number[], checkOver: boolean): number {
    let streak = 0;
    for (let i = digits.length - 1; i >= 0; i--) {
      const isOver = digits[i] >= 5;
      if ((checkOver && isOver) || (!checkOver && !isOver)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }
}

// ============================================
// ENHANCED STRATEGY 4: BOLLINGER BANDS PRESSURE
// ============================================

class BollingerPressureStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { prices, bollingerUpper, bollingerLower, bollingerMiddle, lastDigits } = data;
    const currentPrice = prices[prices.length - 1] || 0;
    const reasons: string[] = [];
    let overConfidence = 0;
    let underConfidence = 0;
    
    // Enhanced Bollinger Band position analysis
    const bandWidth = bollingerUpper - bollingerLower;
    const positionInBand = (currentPrice - bollingerLower) / bandWidth;
    
    if (positionInBand >= 0.95) {
      // Price near upper band
      underConfidence += 55;
      reasons.push('Price at upper Bollinger Band (95%+), strong reversal expected DOWN');
    } else if (positionInBand >= 0.85) {
      underConfidence += 35;
      reasons.push('Price near upper Bollinger Band, expecting reversal down');
    } else if (positionInBand >= 0.7) {
      underConfidence += 15;
      reasons.push('Price in upper region of Bollinger Band');
    } else if (positionInBand <= 0.05) {
      overConfidence += 55;
      reasons.push('Price at lower Bollinger Band (5%-), strong reversal expected UP');
    } else if (positionInBand <= 0.15) {
      overConfidence += 35;
      reasons.push('Price near lower Bollinger Band, expecting reversal up');
    } else if (positionInBand <= 0.3) {
      overConfidence += 15;
      reasons.push('Price in lower region of Bollinger Band');
    }
    
    // Check for band squeeze (low volatility) - precedes big moves
    const avgBandWidth = bandWidth / bollingerMiddle;
    if (avgBandWidth < 0.02) {
      if (positionInBand > 0.5) {
        overConfidence += 20;
        reasons.push('Band squeeze + upper position → breakout up expected');
      } else {
        underConfidence += 20;
        reasons.push('Band squeeze + lower position → breakout down expected');
      }
    }
    
    // Bollinger Bounce pattern after touching band
    if (prices.length >= 3) {
      const prevPrice = prices[prices.length - 2];
      const twoBackPrice = prices[prices.length - 3];
      
      const wasAtUpper = prevPrice >= bollingerUpper * 0.99;
      const wasAtLower = prevPrice <= bollingerLower * 1.01;
      const isMovingAway = Math.abs(currentPrice - prevPrice) > 0;
      
      if (wasAtUpper && currentPrice < prevPrice) {
        underConfidence += 25;
        reasons.push('Bounced off upper band → continuing DOWN');
      } else if (wasAtLower && currentPrice > prevPrice) {
        overConfidence += 25;
        reasons.push('Bounced off lower band → continuing UP');
      }
    }
    
    // Digit confirmation with weighted recent digits
    if (lastDigits.length >= 10) {
      const recentDigits = lastDigits.slice(-10);
      const weightedOverCount = recentDigits.reduce((sum, d, idx) => sum + (d >= 5 ? (idx + 1) : 0), 0);
      const weightedUnderCount = recentDigits.reduce((sum, d, idx) => sum + (d <= 4 ? (idx + 1) : 0), 0);
      
      if (weightedOverCount > weightedUnderCount * 1.5) {
        overConfidence += 25;
        reasons.push('Digit flow strongly confirms OVER pressure');
      } else if (weightedUnderCount > weightedOverCount * 1.5) {
        underConfidence += 25;
        reasons.push('Digit flow strongly confirms UNDER pressure');
      } else if (weightedOverCount > weightedUnderCount) {
        overConfidence += 12;
        reasons.push('Digit flow confirms OVER pressure');
      } else if (weightedUnderCount > weightedOverCount) {
        underConfidence += 12;
        reasons.push('Digit flow confirms UNDER pressure');
      }
    }
    
    let direction: DirectionType | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = Math.min(overConfidence, 100);
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = Math.min(underConfidence, 100);
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 55 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// ENHANCED STRATEGY 5: PARABOLIC SAR FLIP
// ============================================

class ParabolicSARStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { prices, parabolicSar, lastDigits } = data;
    const currentPrice = prices[prices.length - 1] || 0;
    const previousPrice = prices[prices.length - 2] || currentPrice;
    const reasons: string[] = [];
    let overConfidence = 0;
    let underConfidence = 0;
    
    // Enhanced SAR position analysis
    const sarBelow = parabolicSar < currentPrice;
    const sarAbove = parabolicSar > currentPrice;
    const distanceToSar = Math.abs(currentPrice - parabolicSar) / currentPrice * 100;
    
    if (sarBelow) {
      overConfidence += 45;
      reasons.push(`SAR below price (${distanceToSar.toFixed(1)}% away) → UPWARD trend`);
      
      if (distanceToSar > 1) {
        overConfidence += 15;
        reasons.push('Strong SAR distance confirms uptrend');
      }
    } else if (sarAbove) {
      underConfidence += 45;
      reasons.push(`SAR above price (${distanceToSar.toFixed(1)}% away) → DOWNWARD trend`);
      
      if (distanceToSar > 1) {
        underConfidence += 15;
        reasons.push('Strong SAR distance confirms downtrend');
      }
    }
    
    // Enhanced SAR flip detection
    const previousSarBelow = parabolicSar < previousPrice;
    const sarFlippedUp = !previousSarBelow && sarBelow;
    const sarFlippedDown = previousSarBelow && !sarBelow;
    
    if (sarFlippedUp) {
      overConfidence += 35;
      reasons.push('SAR JUST FLIPPED UP → NEW UPTREND SIGNAL');
    } else if (sarFlippedDown) {
      underConfidence += 35;
      reasons.push('SAR JUST FLIPPED DOWN → NEW DOWNTREND SIGNAL');
    }
    
    // Check for sustained trend momentum
    if (prices.length >= 10) {
      const recentPrices = prices.slice(-10);
      let upDays = 0, downDays = 0;
      for (let i = 1; i < recentPrices.length; i++) {
        if (recentPrices[i] > recentPrices[i-1]) upDays++;
        else if (recentPrices[i] < recentPrices[i-1]) downDays++;
      }
      
      if (sarBelow && upDays >= 7) {
        overConfidence += 20;
        reasons.push('Strong sustained uptrend confirmed');
      } else if (sarAbove && downDays >= 7) {
        underConfidence += 20;
        reasons.push('Strong sustained downtrend confirmed');
      }
    }
    
    // Enhanced digit confirmation with trend alignment
    if (lastDigits.length >= 8) {
      const recentDigits = lastDigits.slice(-8);
      const overDigits = recentDigits.filter(d => d >= 5).length;
      const underDigits = recentDigits.filter(d => d <= 4).length;
      const overPercent = (overDigits / 8) * 100;
      const underPercent = (underDigits / 8) * 100;
      
      if (sarBelow && overPercent >= 62.5) {
        overConfidence += 20;
        reasons.push(`Digit flow (${overPercent.toFixed(0)}% OVER) confirms uptrend`);
      } else if (sarBelow && overPercent >= 50) {
        overConfidence += 10;
        reasons.push('Digit flow slightly confirms uptrend');
      }
      
      if (sarAbove && underPercent >= 62.5) {
        underConfidence += 20;
        reasons.push(`Digit flow (${underPercent.toFixed(0)}% UNDER) confirms downtrend`);
      } else if (sarAbove && underPercent >= 50) {
        underConfidence += 10;
        reasons.push('Digit flow slightly confirms downtrend');
      }
    }
    
    let direction: DirectionType | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = Math.min(overConfidence, 100);
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = Math.min(underConfidence, 100);
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 55 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// ENHANCED STRATEGY 6: SMART COMBO
// ============================================

class SmartComboStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { sma5, sma10, prices, rsi, lastDigits, bollingerUpper, bollingerLower, bollingerMiddle } = data;
    const currentPrice = prices[prices.length - 1] || 0;
    const reasons: string[] = [];
    let overScore = 0;
    let underScore = 0;
    let evenScore = 0;
    let oddScore = 0;
    
    // 1. ENHANCED TREND ANALYSIS
    const isBullishTrend = currentPrice > sma5 && currentPrice > sma10;
    const isBearishTrend = currentPrice < sma5 && currentPrice < sma10;
    
    if (isBullishTrend) {
      overScore += 30;
      evenScore += 15;
      reasons.push('STRONG bullish SMA trend');
      
      // Check SMA alignment strength
      if (sma5 > sma10) {
        overScore += 10;
        reasons.push('Golden cross (SMA5 > SMA10)');
      }
    } else if (isBearishTrend) {
      underScore += 30;
      oddScore += 15;
      reasons.push('STRONG bearish SMA trend');
      
      if (sma5 < sma10) {
        underScore += 10;
        reasons.push('Death cross (SMA5 < SMA10)');
      }
    } else if (currentPrice > sma5) {
      overScore += 15;
      reasons.push('Mild bullish (above SMA5)');
    } else if (currentPrice < sma5) {
      underScore += 15;
      reasons.push('Mild bearish (below SMA5)');
    }
    
    // 2. ENHANCED MOMENTUM (RSI)
    if (rsi >= 70) {
      overScore += 25;
      evenScore += 20;
      reasons.push(`Overbought RSI ${rsi.toFixed(0)} - continuation likely`);
    } else if (rsi >= 60) {
      overScore += 20;
      evenScore += 15;
      reasons.push(`Strong RSI ${rsi.toFixed(0)}`);
    } else if (rsi >= 55) {
      overScore += 12;
      evenScore += 10;
      reasons.push(`RSI ${rsi.toFixed(0)} supports upward`);
    } else if (rsi <= 30) {
      underScore += 25;
      oddScore += 20;
      reasons.push(`Oversold RSI ${rsi.toFixed(0)} - continuation likely`);
    } else if (rsi <= 40) {
      underScore += 20;
      oddScore += 15;
      reasons.push(`Weak RSI ${rsi.toFixed(0)}`);
    } else if (rsi <= 45) {
      underScore += 12;
      oddScore += 10;
      reasons.push(`RSI ${rsi.toFixed(0)} suggests downward`);
    }
    
    // 3. ENHANCED DIGIT FLOW
    if (lastDigits.length >= 20) {
      const recentDigits = lastDigits.slice(-20);
      const overDigits = recentDigits.filter(d => d >= 5).length;
      const underDigits = recentDigits.filter(d => d <= 4).length;
      const evenDigits = recentDigits.filter(d => d % 2 === 0).length;
      const oddDigits = recentDigits.filter(d => d % 2 !== 0).length;
      
      const overPercent = (overDigits / 20) * 100;
      const underPercent = (underDigits / 20) * 100;
      const evenPercent = (evenDigits / 20) * 100;
      const oddPercent = (oddDigits / 20) * 100;
      
      if (overPercent >= 65) {
        overScore += 35;
        reasons.push(`STRONG OVER dominance: ${overPercent.toFixed(0)}%`);
      } else if (overPercent >= 55) {
        overScore += 20;
        reasons.push(`${overPercent.toFixed(0)}% OVER digits`);
      }
      
      if (underPercent >= 65) {
        underScore += 35;
        reasons.push(`STRONG UNDER dominance: ${underPercent.toFixed(0)}%`);
      } else if (underPercent >= 55) {
        underScore += 20;
        reasons.push(`${underPercent.toFixed(0)}% UNDER digits`);
      }
      
      if (evenPercent >= 65) {
        evenScore += 30;
        reasons.push(`STRONG EVEN dominance: ${evenPercent.toFixed(0)}%`);
      } else if (evenPercent >= 55) {
        evenScore += 15;
        reasons.push(`${evenPercent.toFixed(0)}% EVEN digits`);
      }
      
      if (oddPercent >= 65) {
        oddScore += 30;
        reasons.push(`STRONG ODD dominance: ${oddPercent.toFixed(0)}%`);
      } else if (oddPercent >= 55) {
        oddScore += 15;
        reasons.push(`${oddPercent.toFixed(0)}% ODD digits`);
      }
    }
    
    // 4. VOLATILITY & BOLLINGER
    const positionInBand = (currentPrice - bollingerLower) / (bollingerUpper - bollingerLower);
    const bandWidth = (bollingerUpper - bollingerLower) / bollingerMiddle;
    
    if (positionInBand >= 0.85) {
      underScore += 25;
      reasons.push('Price near upper Bollinger Band');
    } else if (positionInBand <= 0.15) {
      overScore += 25;
      reasons.push('Price near lower Bollinger Band');
    }
    
    if (bandWidth > 0.05) {
      if (positionInBand > 0.5) {
        overScore += 15;
        reasons.push('High volatility + upper position');
      } else {
        underScore += 15;
        reasons.push('High volatility + lower position');
      }
    }
    
    // 5. RECENT PRICE MOMENTUM
    if (prices.length >= 5) {
      const momentum = (prices[prices.length - 1] - prices[prices.length - 5]) / prices[prices.length - 5] * 100;
      if (momentum > 0.3) {
        overScore += 20;
        evenScore += 10;
        reasons.push(`Strong upward momentum (+${momentum.toFixed(1)}%)`);
      } else if (momentum < -0.3) {
        underScore += 20;
        oddScore += 10;
        reasons.push(`Strong downward momentum (${momentum.toFixed(1)}%)`);
      }
    }
    
    // Determine best direction
    const scores = { OVER: overScore, UNDER: underScore, EVEN: evenScore, ODD: oddScore };
    const sortedDirections = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const bestDirection = sortedDirections[0];
    const secondBest = sortedDirections[1];
    
    // Easy entry conditions: strong signal or clear leader
    const isStrongSignal = bestDirection[1] >= 70;
    const isClearLeader = (bestDirection[1] - secondBest[1]) >= 20;
    
    if (!isStrongSignal && !isClearLeader) return null;
    if (bestDirection[1] < this.config.minConfidence) return null;
    
    const confidence = Math.min(bestDirection[1], 100);
    const strength: SignalStrength = 
      confidence >= 75 ? 'STRONG' : confidence >= 60 ? 'MODERATE' : 'WEAK';
    
    return {
      direction: bestDirection[0] as DirectionType,
      confidence,
      strength,
      reasons: reasons.slice(0, 5)
    };
  }
}

// ============================================
// MAIN BOT COMPONENT
// ============================================

export default function MultiStrategyBot() {
  const { isAuthorized, balance: apiBalance, activeAccount, refreshBalance } = useAuth();
  const { recordLoss } = useLossRequirement();
  
  // UI State
  const [activeStrategy, setActiveStrategy] = useState<StrategyType>('smart_combo');
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showStrategyFilter, setShowStrategyFilter] = useState(false);
  
  // NEW: Direction Filter
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL');
  
  // NEW: Entry Threshold Configuration
  const [entryThresholds, setEntryThresholds] = useState<EntryThresholds>({
    strongEntry: 70,
    moderateEntry: 55,
    minEntry: 50,
    requireMultipleSignals: false
  });
  
  // Strategy Configurations with enhanced thresholds
  const [strategyConfigs, setStrategyConfigs] = useState<Record<StrategyType, StrategyConfig>>({
    trend_over_under: { enabled: true, minConfidence: 50, requireConfirmation: false },
    even_odd_momentum: { enabled: true, minConfidence: 50, requireConfirmation: false },
    digit_reversal: { enabled: true, minConfidence: 55, requireConfirmation: false },
    bollinger_pressure: { enabled: true, minConfidence: 50, requireConfirmation: false },
    parabolic_sar: { enabled: true, minConfidence: 50, requireConfirmation: false },
    smart_combo: { enabled: true, minConfidence: 55, requireConfirmation: false }
  });
  
  // Risk Settings
  const [baseStake, setBaseStake] = useState('0.6');
  const [martingaleEnabled, setMartingaleEnabled] = useState(true);
  const [martingaleMultiplier, setMartingaleMultiplier] = useState('2.0');
  const [maxMartingaleSteps, setMaxMartingaleSteps] = useState('3');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('25');
  const [maxDailyLoss, setMaxDailyLoss] = useState('50');
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState('5');
  
  // Bot State
  const [isRunning, setIsRunning] = useState(false);
  const runningRef = useRef(false);
  const [botStatus, setBotStatus] = useState<'idle' | 'scanning' | 'signal_found' | 'trading' | 'cooldown'>('idle');
  const [currentSignal, setCurrentSignal] = useState<Signal | null>(null);
  const [currentMarketData, setCurrentMarketData] = useState<Map<string, MarketData>>(new Map());
  
  // Performance Stats
  const [balance, setBalance] = useState(apiBalance);
  const [netProfit, setNetProfit] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);
  const [winningTrades, setWinningTrades] = useState(0);
  const [losingTrades, setLosingTrades] = useState(0);
  const [consecutiveLosses, setConsecutiveLosses] = useState(0);
  const [totalStaked, setTotalStaked] = useState(0);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  
  // Trading State
  const [currentStake, setCurrentStake] = useState(0);
  const [martingaleStep, setMartingaleStep] = useState(0);
  const [inRecovery, setInRecovery] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  
  // Refs
  const marketDataRef = useRef<Map<string, MarketData>>(new Map());
  const lastTradeTimeRef = useRef<number>(0);
  const dailyLossRef = useRef(0);
  const logIdRef = useRef(0);
  const balanceRef = useRef(apiBalance);
  const netProfitRef = useRef(0);
  
  // Sound effects
  const playSound = useCallback((type: 'signal' | 'win' | 'loss' | 'warning') => {
    if (!soundEnabled) return;
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (type === 'signal') {
        oscillator.frequency.value = 880;
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
      } else if (type === 'win') {
        oscillator.frequency.value = 1046.50;
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.5);
      } else if (type === 'loss') {
        oscillator.frequency.value = 440;
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.4);
      } else if (type === 'warning') {
        oscillator.frequency.value = 660;
        gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.6);
      }
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {}
  }, [soundEnabled]);
  
  // Update balance sync
  useEffect(() => {
    const syncBalance = async () => {
      if (refreshBalance) await refreshBalance();
      setBalance(apiBalance);
      balanceRef.current = apiBalance;
    };
    syncBalance();
    const interval = setInterval(syncBalance, 2000);
    return () => clearInterval(interval);
  }, [apiBalance, refreshBalance]);
  
  // Add log entry
  const addLogEntry = useCallback((entry: Omit<LogEntry, 'id'>) => {
    const newEntry = { ...entry, id: ++logIdRef.current };
    setLogEntries(prev => [newEntry, ...prev].slice(0, 100));
  }, []);
  
  // Update market data from ticks
  const updateMarketData = useCallback((symbol: string, price: number) => {
    const digit = getLastDigit(price);
    if (typeof digit !== 'number') return;
    
    const existing = marketDataRef.current.get(symbol) || {
      symbol,
      name: TRADING_MARKETS.find(m => m.symbol === symbol)?.name || symbol,
      lastDigits: [],
      timestamps: [],
      prices: [],
      sma5: 0,
      sma10: 0,
      sma20: 0,
      rsi: 50,
      bollingerUpper: 0,
      bollingerLower: 0,
      bollingerMiddle: 0,
      parabolicSar: 0,
      evenCount: 0,
      oddCount: 0,
      overCount: 0,
      underCount: 0,
      lastUpdate: Date.now()
    };
    
    existing.lastDigits.push(digit);
    if (existing.lastDigits.length > DIGIT_HISTORY_SIZE) existing.lastDigits.shift();
    
    existing.prices.push(price);
    if (existing.prices.length > PRICE_HISTORY_SIZE) existing.prices.shift();
    
    if (digit % 2 === 0) existing.evenCount++;
    else existing.oddCount++;
    
    if (digit >= 5) existing.overCount++;
    else existing.underCount++;
    
    if (existing.prices.length >= SMA_PERIODS.long) {
      existing.sma5 = calculateSMA(existing.prices, SMA_PERIODS.short);
      existing.sma10 = calculateSMA(existing.prices, SMA_PERIODS.medium);
      existing.sma20 = calculateSMA(existing.prices, SMA_PERIODS.long);
      existing.rsi = calculateRSI(existing.prices, RSI_PERIODS);
      
      const bb = calculateBollingerBands(existing.prices, BOLLINGER_PERIODS, BOLLINGER_STD);
      existing.bollingerUpper = bb.upper;
      existing.bollingerLower = bb.lower;
      existing.bollingerMiddle = bb.middle;
      
      existing.parabolicSar = calculateParabolicSAR(
        existing.prices,
        existing.prices.map(p => p * 1.001),
        existing.prices.map(p => p * 0.999)
      );
    }
    
    existing.lastUpdate = Date.now();
    marketDataRef.current.set(symbol, existing);
    setCurrentMarketData(new Map(marketDataRef.current));
  }, []);
  
  // Subscribe to ticks
  useEffect(() => {
    let mounted = true;
    
    const setupSubscriptions = async () => {
      if (!derivApi.isConnected) await derivApi.connect();
      
      for (const market of TRADING_MARKETS) {
        try {
          await derivApi.subscribeTicks(market.symbol as MarketSymbol, (tick: any) => {
            if (mounted && tick?.quote) {
              updateMarketData(market.symbol, tick.quote);
            }
          });
        } catch (error) {
          console.error(`Failed to subscribe to ${market.symbol}:`, error);
        }
      }
    };
    
    setupSubscriptions();
    
    return () => {
      mounted = false;
      TRADING_MARKETS.forEach(market => {
        derivApi.unsubscribeTicks?.(market.symbol as MarketSymbol).catch(() => {});
      });
    };
  }, [updateMarketData]);
  
  // Get strategy instance
  const getStrategy = useCallback((type: StrategyType) => {
    const config = strategyConfigs[type];
    switch (type) {
      case 'trend_over_under':
        return new TrendOverUnderStrategy(config);
      case 'even_odd_momentum':
        return new EvenOddMomentumStrategy(config);
      case 'digit_reversal':
        return new DigitReversalStrategy(config);
      case 'bollinger_pressure':
        return new BollingerPressureStrategy(config);
      case 'parabolic_sar':
        return new ParabolicSARStrategy(config);
      case 'smart_combo':
        return new SmartComboStrategy(config);
      default:
        return new SmartComboStrategy(config);
    }
  }, [strategyConfigs]);
  
  // NEW: Filter signal by direction preference
  const filterSignalByDirection = useCallback((signal: Signal): Signal | null => {
    if (directionFilter === 'ALL') return signal;
    
    if (directionFilter === 'OVER_UNDER_ONLY') {
      if (signal.direction === 'OVER' || signal.direction === 'UNDER') {
        return signal;
      }
      return null;
    }
    
    if (directionFilter === 'EVEN_ODD_ONLY') {
      if (signal.direction === 'EVEN' || signal.direction === 'ODD') {
        return signal;
      }
      return null;
    }
    
    return signal;
  }, [directionFilter]);
  
  // NEW: Easy entry detection - checks if signal meets easy entry criteria
  const isEasyEntry = useCallback((signal: Signal): boolean => {
    // Strong signals are always easy entries
    if (signal.strength === 'STRONG' && signal.confidence >= entryThresholds.strongEntry) {
      return true;
    }
    
    // Moderate signals are easy entries if above threshold
    if (signal.strength === 'MODERATE' && signal.confidence >= entryThresholds.moderateEntry) {
      return true;
    }
    
    return false;
  }, [entryThresholds]);
  
  // NEW: Get all signals from all strategies for a market
  const getAllSignalsForMarket = useCallback((data: MarketData): Array<{ strategy: StrategyType, signal: Signal }> => {
    const signals: Array<{ strategy: StrategyType, signal: Signal }> = [];
    
    for (const [strategyType, config] of Object.entries(strategyConfigs)) {
      if (!config.enabled) continue;
      
      const strategy = getStrategy(strategyType as StrategyType);
      const signal = strategy.analyze(data);
      
      if (signal && signal.confidence >= config.minConfidence) {
        signals.push({ strategy: strategyType as StrategyType, signal });
      }
    }
    
    return signals;
  }, [strategyConfigs, getStrategy]);
  
  // NEW: Multi-signal consensus analysis
  const analyzeWithConsensus = useCallback((): { 
    bestSignal: Signal | null; 
    market: string; 
    marketData: MarketData;
    consensus: { direction: DirectionType; count: number; strategies: string[] }[];
    easyEntry: boolean;
  } | null => {
    const marketSignals: Map<string, Array<{ strategy: StrategyType, signal: Signal }>> = new Map();
    
    // Collect signals from all markets
    for (const [symbol, data] of marketDataRef.current) {
      if (data.lastDigits.length < MIN_DIGITS_FOR_ANALYSIS) continue;
      
      const signals = getAllSignalsForMarket(data);
      if (signals.length > 0) {
        marketSignals.set(symbol, signals);
      }
    }
    
    if (marketSignals.size === 0) return null;
    
    // Analyze each market for best signal
    const marketResults: Array<{
      market: string;
      marketData: MarketData;
      bestSignal: Signal;
      allSignals: Array<{ strategy: StrategyType, signal: Signal }>;
    }> = [];
    
    for (const [symbol, signals] of marketSignals) {
      // Group signals by direction
      const directionGroups: Map<DirectionType, Array<{ strategy: StrategyType, signal: Signal }>> = new Map();
      for (const item of signals) {
        const dir = item.signal.direction;
        if (!directionGroups.has(dir)) directionGroups.set(dir, []);
        directionGroups.get(dir)!.push(item);
      }
      
      // Calculate average confidence per direction
      const directionAverages: Array<{ direction: DirectionType, avgConfidence: number, signals: Array<{ strategy: StrategyType, signal: Signal }> }> = [];
      for (const [dir, dirSignals] of directionGroups) {
        const avgConfidence = dirSignals.reduce((sum, s) => sum + s.signal.confidence, 0) / dirSignals.length;
        directionAverages.push({ direction: dir, avgConfidence, signals: dirSignals });
      }
      
      // Sort by average confidence
      directionAverages.sort((a, b) => b.avgConfidence - a.avgConfidence);
      
      if (directionAverages.length === 0) continue;
      
      // Get best direction
      const bestDir = directionAverages[0];
      
      // Create combined signal from best direction
      const combinedReasons = bestDir.signals.flatMap(s => s.signal.reasons).slice(0, 5);
      const bestSignal: Signal = {
        direction: bestDir.direction,
        confidence: Math.min(bestDir.avgConfidence, 100),
        strength: bestDir.avgConfidence >= 70 ? 'STRONG' : bestDir.avgConfidence >= 55 ? 'MODERATE' : 'WEAK',
        reasons: combinedReasons
      };
      
      marketResults.push({
        market: symbol,
        marketData: marketDataRef.current.get(symbol)!,
        bestSignal,
        allSignals: signals
      });
    }
    
    if (marketResults.length === 0) return null;
    
    // Sort by signal confidence
    marketResults.sort((a, b) => b.bestSignal.confidence - a.bestSignal.confidence);
    const best = marketResults[0];
    
    // Filter by direction preference
    const filteredSignal = filterSignalByDirection(best.bestSignal);
    if (!filteredSignal) return null;
    
    // Check if this is an easy entry
    const easyEntry = isEasyEntry(filteredSignal);
    
    // If requiring multiple signals, check if we have at least 2 strategies agreeing on direction
    if (entryThresholds.requireMultipleSignals) {
      const agreeingSignals = best.allSignals.filter(s => s.signal.direction === best.bestSignal.direction);
      if (agreeingSignals.length < 2) return null;
    }
    
    return {
      bestSignal: filteredSignal,
      market: best.market,
      marketData: best.marketData,
      consensus: Array.from(new Map(
        best.allSignals.map(s => [s.signal.direction, s])
      ).entries()).map(([dir, signals]) => ({
        direction: dir,
        count: best.allSignals.filter(s => s.signal.direction === dir).length,
        strategies: best.allSignals.filter(s => s.signal.direction === dir).map(s => s.strategy)
      })),
      easyEntry
    };
  }, [getAllSignalsForMarket, filterSignalByDirection, isEasyEntry, entryThresholds.requireMultipleSignals]);
  
  // Execute trade
  const executeTrade = useCallback(async (
    signal: Signal,
    symbol: string,
    stakeAmount: number,
    step: number
  ): Promise<{ won: boolean; pnl: number }> => {
    if (!derivApi.isConnected) {
      await derivApi.connect();
    }
    
    let contractType: string;
    let barrier: string | undefined;
    
    switch (signal.direction) {
      case 'OVER':
        contractType = 'DIGITOVER';
        barrier = '4';
        break;
      case 'UNDER':
        contractType = 'DIGITUNDER';
        barrier = '5';
        break;
      case 'EVEN':
        contractType = 'DIGITEVEN';
        break;
      case 'ODD':
        contractType = 'DIGITODD';
        break;
      default:
        contractType = 'DIGITEVEN';
    }
    
    const buyParams: any = {
      contract_type: contractType,
      symbol: symbol as MarketSymbol,
      duration: 1,
      duration_unit: 't',
      basis: 'stake',
      amount: stakeAmount
    };
    if (barrier) buyParams.barrier = barrier;
    
    try {
      const buyResult = await derivApi.buyContract(buyParams);
      if (!buyResult?.contractId) throw new Error('No contract ID');
      
      if (copyTradingService.enabled) {
        copyTradingService.copyTrade({ ...buyParams, masterTradeId: buyResult.contractId }).catch(() => {});
      }
      
      const result = await derivApi.waitForContractResult(buyResult.contractId);
      const won = result.status === 'won';
      const pnl = result.profit;
      
      const newBalance = balanceRef.current + pnl;
      balanceRef.current = newBalance;
      netProfitRef.current += pnl;
      setBalance(newBalance);
      setNetProfit(netProfitRef.current);
      
      if (won) {
        setWinningTrades(prev => prev + 1);
        setConsecutiveLosses(0);
        playSound('win');
      } else {
        setLosingTrades(prev => prev + 1);
        setConsecutiveLosses(prev => prev + 1);
        playSound('loss');
        if (activeAccount?.is_virtual) {
          recordLoss(stakeAmount, symbol, 5000);
        }
      }
      
      setTotalTrades(prev => prev + 1);
      setTotalStaked(prev => prev + stakeAmount);
      
      addLogEntry({
        time: new Date().toLocaleTimeString(),
        strategy: activeStrategy,
        symbol,
        direction: signal.direction,
        stake: stakeAmount,
        martingaleStep: step,
        result: won ? 'Win' : 'Loss',
        pnl,
        balance: newBalance,
        confidence: signal.confidence
      });
      
      return { won, pnl };
    } catch (error) {
      console.error('Trade execution error:', error);
      playSound('warning');
      return { won: false, pnl: 0 };
    }
  }, [activeStrategy, activeAccount, recordLoss, playSound, addLogEntry]);
  
  // Main trading loop with easy entry focus
  const startBot = useCallback(async () => {
    if (!isAuthorized || isRunning) return;
    
    const stake = parseFloat(baseStake);
    if (stake < 0.35) {
      playSound('warning');
      return;
    }
    
    setIsRunning(true);
    runningRef.current = true;
    setBotStatus('scanning');
    setCurrentStake(stake);
    setMartingaleStep(0);
    setInRecovery(false);
    setConsecutiveLosses(0);
    dailyLossRef.current = 0;
    
    let currentStakeAmount = stake;
    let currentStep = 0;
    let consecutiveLossCount = 0;
    
    const maxDaily = parseFloat(maxDailyLoss);
    const maxConsecutive = parseInt(maxConsecutiveLosses);
    const tpTarget = parseFloat(takeProfit);
    const slTarget = parseFloat(stopLoss);
    
    while (runningRef.current) {
      if (Date.now() < cooldownUntil) {
        setBotStatus('cooldown');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      if (netProfitRef.current >= tpTarget) {
        playSound('warning');
        break;
      }
      if (netProfitRef.current <= -slTarget) {
        playSound('warning');
        break;
      }
      
      if (dailyLossRef.current >= maxDaily) {
        playSound('warning');
        break;
      }
      
      if (consecutiveLossCount >= maxConsecutive) {
        playSound('warning');
        setBotStatus('cooldown');
        setCooldownUntil(Date.now() + 300000);
        consecutiveLossCount = 0;
        continue;
      }
      
      setBotStatus('scanning');
      
      let attempts = 0;
      let analysisResult = null;
      
      while (runningRef.current && !analysisResult && attempts < MAX_SCAN_ATTEMPTS) {
        analysisResult = analyzeWithConsensus();
        if (!analysisResult) {
          await new Promise(r => setTimeout(r, SCAN_INTERVAL_MS));
          attempts++;
        }
      }
      
      if (!analysisResult || !runningRef.current) continue;
      
      const { bestSignal, market, marketData, consensus, easyEntry } = analysisResult;
      setCurrentSignal(bestSignal);
      setBotStatus('signal_found');
      
      // Additional pause for easy entries vs normal entries
      if (easyEntry) {
        playSound('signal');
        await new Promise(r => setTimeout(r, 300));
      } else {
        playSound('signal');
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (!runningRef.current) break;
      
      setBotStatus('trading');
      
      const { won, pnl } = await executeTrade(
        bestSignal,
        market,
        currentStakeAmount,
        currentStep
      );
      
      if (won) {
        currentStakeAmount = stake;
        currentStep = 0;
        consecutiveLossCount = 0;
        setCurrentStake(stake);
        setMartingaleStep(0);
        setInRecovery(false);
      } else {
        consecutiveLossCount++;
        dailyLossRef.current += currentStakeAmount;
        
        if (martingaleEnabled && currentStep < parseInt(maxMartingaleSteps)) {
          currentStep++;
          currentStakeAmount = parseFloat((currentStakeAmount * parseFloat(martingaleMultiplier)).toFixed(2));
          setCurrentStake(currentStakeAmount);
          setMartingaleStep(currentStep);
          setInRecovery(true);
        } else {
          currentStakeAmount = stake;
          currentStep = 0;
          setCurrentStake(stake);
          setMartingaleStep(0);
          setInRecovery(false);
        }
      }
      
      await new Promise(r => setTimeout(r, easyEntry ? 800 : 1000));
    }
    
    setIsRunning(false);
    runningRef.current = false;
    setBotStatus('idle');
    setCurrentSignal(null);
  }, [isAuthorized, isRunning, baseStake, martingaleEnabled, martingaleMultiplier, maxMartingaleSteps,
      takeProfit, stopLoss, maxDailyLoss, maxConsecutiveLosses, cooldownUntil, analyzeWithConsensus, executeTrade, playSound]);
  
  const stopBot = useCallback(() => {
    runningRef.current = false;
    setIsRunning(false);
    setBotStatus('idle');
  }, []);
  
  const clearLogs = useCallback(() => {
    setLogEntries([]);
    setTotalTrades(0);
    setWinningTrades(0);
    setLosingTrades(0);
    setTotalStaked(0);
  }, []);
  
  const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : '0';
  
  const strategyNames: Record<StrategyType, { name: string; icon: React.ReactNode; description: string }> = {
    trend_over_under: { name: 'Trend O/U', icon: <TrendingUp className="w-4 h-4" />, description: 'SMA-based trend' },
    even_odd_momentum: { name: 'Even/Odd', icon: <Activity className="w-4 h-4" />, description: 'Digit momentum' },
    digit_reversal: { name: 'Reversal', icon: <ArrowUp className="w-4 h-4" />, description: 'Streak reversal' },
    bollinger_pressure: { name: 'Bollinger', icon: <BarChart3 className="w-4 h-4" />, description: 'Volatility pressure' },
    parabolic_sar: { name: 'Parabolic', icon: <CircleDot className="w-4 h-4" />, description: 'SAR trend flips' },
    smart_combo: { name: 'SMART', icon: <Brain className="w-4 h-4" />, description: 'Multi-factor combo' }
  };
  
  return (
    <>
      <style>{botStyles}</style>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="max-w-7xl mx-auto space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900/80 to-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                    Multi-Strategy Trading Bot
                  </h1>
                  <p className="text-xs text-slate-400">6 AI-Powered Strategies | Easy Entry Detection</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowStrategyFilter(!showStrategyFilter)}
                  className={`p-2 rounded-lg transition-colors ${showStrategyFilter ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-800/50 text-slate-400 hover:text-slate-200'}`}
                >
                  <Filter className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <Badge className={`${botStatus === 'idle' ? 'bg-slate-700' : botStatus === 'scanning' ? 'bg-amber-500/20 text-amber-400 animate-pulse' : botStatus === 'signal_found' ? 'bg-emerald-500/20 text-emerald-400 animate-blink-green' : botStatus === 'trading' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700'} border-0 px-3 py-1`}>
                  {botStatus.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>
          
          {/* Direction Filter Panel */}
          {showStrategyFilter && (
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 animate-fadeIn">
              <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" /> Trading Direction Filter
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-2">Direction Preference</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDirectionFilter('ALL')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        directionFilter === 'ALL'
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                      }`}
                    >
                      ALL Directions
                    </button>
                    <button
                      onClick={() => setDirectionFilter('OVER_UNDER_ONLY')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        directionFilter === 'OVER_UNDER_ONLY'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg'
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                      }`}
                    >
                      OVER / UNDER Only
                    </button>
                    <button
                      onClick={() => setDirectionFilter('EVEN_ODD_ONLY')}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        directionFilter === 'EVEN_ODD_ONLY'
                          ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg'
                          : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                      }`}
                    >
                      EVEN / ODD Only
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-2">
                    {directionFilter === 'ALL' && 'Trade all signal types (OVER, UNDER, EVEN, ODD)'}
                    {directionFilter === 'OVER_UNDER_ONLY' && 'Only trade OVER and UNDER signals (digit boundaries)'}
                    {directionFilter === 'EVEN_ODD_ONLY' && 'Only trade EVEN and ODD signals (parity-based)'}
                  </p>
                </div>
                
                <div>
                  <label className="text-[10px] text-slate-400 block mb-2">Easy Entry Thresholds</label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Strong Entry (≥)</span>
                      <Input 
                        type="number" 
                        min="50" 
                        max="100" 
                        value={entryThresholds.strongEntry} 
                        onChange={e => setEntryThresholds(prev => ({ ...prev, strongEntry: parseInt(e.target.value) || 70 }))}
                        className="w-20 h-7 text-xs bg-slate-800/50"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Moderate Entry (≥)</span>
                      <Input 
                        type="number" 
                        min="40" 
                        max="100" 
                        value={entryThresholds.moderateEntry} 
                        onChange={e => setEntryThresholds(prev => ({ ...prev, moderateEntry: parseInt(e.target.value) || 55 }))}
                        className="w-20 h-7 text-xs bg-slate-800/50"
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] text-slate-400 block mb-2">Entry Conditions</label>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Require multiple strategy agreement</span>
                    <Switch 
                      checked={entryThresholds.requireMultipleSignals} 
                      onCheckedChange={(checked) => setEntryThresholds(prev => ({ ...prev, requireMultipleSignals: checked }))}
                    />
                  </div>
                  <p className="text-[9px] text-slate-500 mt-2">
                    {entryThresholds.requireMultipleSignals 
                      ? 'Requires at least 2 strategies to agree on direction' 
                      : 'Single strategy signals are accepted'}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" /> Risk Management
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-slate-400">Base Stake ($)</label>
                      <Input type="number" min="0.35" step="0.01" value={baseStake} onChange={e => setBaseStake(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Take Profit ($)</label>
                      <Input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Stop Loss ($)</label>
                      <Input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-purple-400" /> Martingale
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">Enabled</span>
                      <Switch checked={martingaleEnabled} onCheckedChange={setMartingaleEnabled} />
                    </div>
                    {martingaleEnabled && (
                      <>
                        <div>
                          <label className="text-[10px] text-slate-400">Multiplier</label>
                          <Input type="number" min="1.1" step="0.1" value={martingaleMultiplier} onChange={e => setMartingaleMultiplier(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400">Max Steps</label>
                          <Input type="number" min="1" max="5" value={maxMartingaleSteps} onChange={e => setMaxMartingaleSteps(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400" /> Limits
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-slate-400">Max Daily Loss ($)</label>
                      <Input type="number" value={maxDailyLoss} onChange={e => setMaxDailyLoss(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400">Max Consecutive Losses</label>
                      <Input type="number" min="1" max="10" value={maxConsecutiveLosses} onChange={e => setMaxConsecutiveLosses(e.target.value)} className="h-8 text-sm bg-slate-800/50" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Strategy Selector */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {(Object.entries(strategyNames) as [StrategyType, typeof strategyNames[StrategyType]][]).map(([key, { name, icon, description }]) => (
              <button
                key={key}
                onClick={() => setActiveStrategy(key)}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  activeStrategy === key
                    ? 'bg-gradient-to-br from-purple-600/20 to-indigo-600/20 border-2 border-purple-500/50 shadow-lg shadow-purple-500/10'
                    : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50'
                }`}
              >
                <div className="flex flex-col items-center gap-1">
                  <div className={`p-1.5 rounded-lg ${activeStrategy === key ? 'text-purple-400' : 'text-slate-400'}`}>
                    {icon}
                  </div>
                  <span className={`text-xs font-bold ${activeStrategy === key ? 'text-purple-400' : 'text-slate-300'}`}>{name}</span>
                  <span className="text-[8px] text-slate-500 text-center hidden md:block">{description}</span>
                </div>
              </button>
            ))}
          </div>
          
          {/* Active Strategy Info & Current Signal */}
          {(currentSignal || botStatus !== 'idle') && (
            <div className={`bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm rounded-xl p-4 border-2 ${
              currentSignal?.strength === 'STRONG' ? 'border-emerald-500/50' :
              currentSignal?.strength === 'MODERATE' ? 'border-amber-500/50' :
              'border-slate-700/50'
            } animate-fadeIn`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${
                    currentSignal?.strength === 'STRONG' ? 'bg-emerald-500/20' :
                    currentSignal?.strength === 'MODERATE' ? 'bg-amber-500/20' :
                    'bg-slate-500/20'
                  }`}>
                    {currentSignal ? (
                      currentSignal.direction === 'OVER' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> :
                      currentSignal.direction === 'UNDER' ? <TrendingDown className="w-5 h-5 text-red-400" /> :
                      currentSignal.direction === 'EVEN' ? <Activity className="w-5 h-5 text-purple-400" /> :
                      <Activity className="w-5 h-5 text-orange-400" />
                    ) : (
                      <Scan className="w-5 h-5 text-amber-400 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">
                      {currentSignal ? `${currentSignal.direction} SIGNAL` : `${strategyNames[activeStrategy].name} ACTIVE`}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {currentSignal ? `${currentSignal.strength} • ${currentSignal.confidence}% confidence` : 'Scanning for easy entries...'}
                    </p>
                  </div>
                </div>
                {currentSignal && (
                  <div className="flex gap-2">
                    {isEasyEntry(currentSignal) && (
                      <Badge className="bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border-0 px-3 py-1 text-[10px]">
                        <Sparkles className="w-3 h-3 inline mr-1" />
                        EASY ENTRY
                      </Badge>
                    )}
                    <Badge className={`text-[10px] ${
                      currentSignal.strength === 'STRONG' ? 'bg-emerald-500/20 text-emerald-400' :
                      currentSignal.strength === 'MODERATE' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-slate-500/20 text-slate-400'
                    } border-0 px-3 py-1`}>
                      {currentSignal.confidence}% confidence
                    </Badge>
                  </div>
                )}
              </div>
              
              {currentSignal && currentSignal.reasons.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {currentSignal.reasons.slice(0, 3).map((reason, i) => (
                    <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800/50 text-[9px] text-slate-300">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      {reason}
                    </div>
                  ))}
                </div>
              )}
              
              {!currentSignal && botStatus === 'scanning' && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Analyzing {TRADING_MARKETS.length} markets for {directionFilter === 'OVER_UNDER_ONLY' ? 'OVER/UNDER' : directionFilter === 'EVEN_ODD_ONLY' ? 'EVEN/ODD' : 'all'} entries...
                </div>
              )}
            </div>
          )}
          
          {/* Stats Grid */}
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Balance</div>
              <div className="font-mono text-sm font-bold text-cyan-400">${balance.toFixed(2)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">P&L</div>
              <div className={`font-mono text-sm font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Win Rate</div>
              <div className="font-mono text-sm font-bold text-emerald-400">{winRate}%</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Trades</div>
              <div className="font-mono text-sm font-bold text-slate-200">{totalTrades}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">W/L</div>
              <div className="font-mono text-sm font-bold">
                <span className="text-emerald-400">{winningTrades}</span>
                <span className="text-slate-600">/</span>
                <span className="text-red-400">{losingTrades}</span>
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Stake</div>
              <div className="font-mono text-sm font-bold text-amber-400">
                ${currentStake.toFixed(2)}{martingaleStep > 0 && <span className="text-[9px] ml-1">x{martingaleStep}</span>}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Total Staked</div>
              <div className="font-mono text-sm font-bold text-purple-400">${totalStaked.toFixed(2)}</div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <div className="text-[9px] text-slate-400">Consecutive</div>
              <div className={`font-mono text-sm font-bold ${consecutiveLosses > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {consecutiveLosses}
              </div>
            </div>
          </div>
          
          {/* Start/Stop Button */}
          <button
            onClick={isRunning ? stopBot : startBot}
            disabled={!isRunning && (!isAuthorized || balance < parseFloat(baseStake))}
            className={`
              w-full py-4 rounded-xl font-bold text-lg transition-all duration-300
              ${isRunning 
                ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-lg shadow-red-500/30' 
                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-lg shadow-purple-500/30'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
              transform active:scale-95
            `}
          >
            <div className="flex items-center justify-center gap-3">
              {isRunning ? (
                <>
                  <StopCircle className="w-5 h-5" />
                  STOP BOT
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  START {strategyNames[activeStrategy].name} BOT
                </>
              )}
            </div>
          </button>
          
          {/* Trade Logs */}
          {showLogs && logEntries.length > 0 && (
            <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  Trade Logs
                </h3>
                <Button variant="ghost" size="sm" onClick={clearLogs} className="h-7 w-7 p-0 text-slate-400 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="max-h-[250px] overflow-auto">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-800/50 sticky top-0">
                    <tr className="text-slate-400">
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Strat</th>
                      <th className="text-left p-2">Symbol</th>
                      <th className="text-left p-2">Dir</th>
                      <th className="text-right p-2">Stake</th>
                      <th className="text-center p-2">Result</th>
                      <th className="text-right p-2">P/L</th>
                      <th className="text-right p-2">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logEntries.map(entry => (
                      <tr key={entry.id} className="border-t border-slate-700/30 hover:bg-slate-800/30">
                        <td className="p-2 font-mono text-[9px] text-slate-400">{entry.time}</td>
                        <td className="p-2 text-[9px] text-purple-400 font-semibold">{entry.strategy.slice(0, 4)}</td>
                        <td className="p-2 font-mono text-[9px] text-slate-300">{entry.symbol}</td>
                        <td className="p-2">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${
                            entry.direction === 'OVER' ? 'bg-emerald-500/20 text-emerald-400' :
                            entry.direction === 'UNDER' ? 'bg-red-500/20 text-red-400' :
                            entry.direction === 'EVEN' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-orange-500/20 text-orange-400'
                          }`}>
                            {entry.direction}
                          </span>
                        </td>
                        <td className="p-2 text-right font-mono text-[9px] text-slate-300">
                          ${entry.stake.toFixed(2)}
                          {entry.martingaleStep > 0 && <span className="text-amber-400 ml-1">x{entry.martingaleStep}</span>}
                        </td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                            entry.result === 'Win' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {entry.result}
                          </span>
                        </td>
                        <td className={`p-2 text-right font-mono text-[9px] font-bold ${entry.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {entry.pnl >= 0 ? '+' : ''}{entry.pnl.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono text-[9px] text-slate-400">${entry.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Toggle Logs Button */}
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
            >
              {showLogs ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
