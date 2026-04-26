// File: src/components/bots/MultiStrategyBot.tsx

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
  Sparkles, Flame, Gauge, ArrowUp, ArrowDown, CircleDot
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

type SignalStrength = 'STRONG' | 'MODERATE' | 'WEAK';

interface Signal {
  direction: 'OVER' | 'UNDER' | 'EVEN' | 'ODD';
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
  // Simplified SAR calculation
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
// STRATEGY 1: TREND-BASED OVER/UNDER
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
    
    // SMA Trend Analysis
    const isAboveSMA5 = currentPrice > sma5;
    const isAboveSMA10 = currentPrice > sma10;
    const isBullishTrend = isAboveSMA5 && isAboveSMA10;
    const isBearishTrend = !isAboveSMA5 && !isAboveSMA10;
    
    if (isBullishTrend) {
      overConfidence += 35;
      reasons.push('Price above SMAs (bullish trend)');
    } else if (isBearishTrend) {
      underConfidence += 35;
      reasons.push('Price below SMAs (bearish trend)');
    }
    
    // Digit Flow Analysis
    if (lastDigits.length >= 20) {
      const recentDigits = lastDigits.slice(-20);
      const overDigits = recentDigits.filter(d => d >= 5).length;
      const underDigits = recentDigits.filter(d => d <= 4).length;
      const overPercent = (overDigits / 20) * 100;
      const underPercent = (underDigits / 20) * 100;
      
      if (overPercent >= 60) {
        overConfidence += 30;
        reasons.push(`${overPercent.toFixed(0)}% digits OVER in last 20 ticks`);
      } else if (underPercent >= 60) {
        underConfidence += 30;
        reasons.push(`${underPercent.toFixed(0)}% digits UNDER in last 20 ticks`);
      }
      
      // Consecutive digit check
      const consecutiveOver = recentDigits.slice(-5).every(d => d >= 5);
      const consecutiveUnder = recentDigits.slice(-5).every(d => d <= 4);
      
      if (consecutiveOver) {
        overConfidence += 20;
        reasons.push('5+ consecutive OVER digits');
      } else if (consecutiveUnder) {
        underConfidence += 20;
        reasons.push('5+ consecutive UNDER digits');
      }
    }
    
    // Determine direction
    let direction: 'OVER' | 'UNDER' | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = overConfidence;
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = underConfidence;
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 50 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// STRATEGY 2: EVEN/ODD MOMENTUM
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
    
    // Digit Distribution Analysis
    if (lastDigits.length >= 20) {
      const recentDigits = lastDigits.slice(-20);
      const evenDigits = recentDigits.filter(d => d % 2 === 0).length;
      const oddDigits = recentDigits.filter(d => d % 2 !== 0).length;
      const evenPercent = (evenDigits / 20) * 100;
      const oddPercent = (oddDigits / 20) * 100;
      
      if (evenPercent >= 60) {
        evenConfidence += 40;
        reasons.push(`${evenPercent.toFixed(0)}% EVEN digits in last 20 ticks`);
      } else if (oddPercent >= 60) {
        oddConfidence += 40;
        reasons.push(`${oddPercent.toFixed(0)}% ODD digits in last 20 ticks`);
      }
      
      // Consecutive pattern
      const consecutiveEven = recentDigits.slice(-4).every(d => d % 2 === 0);
      const consecutiveOdd = recentDigits.slice(-4).every(d => d % 2 !== 0);
      
      if (consecutiveEven) {
        evenConfidence += 25;
        reasons.push('4+ consecutive EVEN digits');
      } else if (consecutiveOdd) {
        oddConfidence += 25;
        reasons.push('4+ consecutive ODD digits');
      }
    }
    
    // RSI Momentum Confirmation
    if (rsi >= 55) {
      evenConfidence += 20;
      reasons.push(`RSI ${rsi.toFixed(0)} supports upward momentum`);
    } else if (rsi <= 45) {
      oddConfidence += 20;
      reasons.push(`RSI ${rsi.toFixed(0)} suggests downward pressure`);
    }
    
    // Price action
    if (prices.length >= 3) {
      const recentPriceChange = prices[prices.length - 1] - prices[prices.length - 3];
      if (recentPriceChange > 0) {
        evenConfidence += 15;
        reasons.push('Rising price action');
      } else if (recentPriceChange < 0) {
        oddConfidence += 15;
        reasons.push('Falling price action');
      }
    }
    
    let direction: 'EVEN' | 'ODD' | null = null;
    let confidence = 0;
    
    if (evenConfidence > oddConfidence && evenConfidence >= this.config.minConfidence) {
      direction = 'EVEN';
      confidence = evenConfidence;
    } else if (oddConfidence > evenConfidence && oddConfidence >= this.config.minConfidence) {
      direction = 'ODD';
      confidence = oddConfidence;
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 50 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// STRATEGY 3: DIGIT REVERSAL
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
    
    if (lastDigits.length < 10) return null;
    
    const recentDigits = lastDigits.slice(-10);
    
    // Check for OVER streak reversal
    const overStreak = recentDigits.slice(-5).every(d => d >= 5);
    const overStreakLength = this.getConsecutiveStreak(recentDigits, true);
    
    if (overStreak || overStreakLength >= 3) {
      underConfidence += 50;
      reasons.push(`${overStreakLength}+ OVER streak, expecting UNDER reversal`);
    }
    
    // Check for UNDER streak reversal
    const underStreak = recentDigits.slice(-5).every(d => d <= 4);
    const underStreakLength = this.getConsecutiveStreak(recentDigits, false);
    
    if (underStreak || underStreakLength >= 3) {
      overConfidence += 50;
      reasons.push(`${underStreakLength}+ UNDER streak, expecting OVER reversal`);
    }
    
    // Check for digit exhaustion
    const lastDigit = recentDigits[recentDigits.length - 1];
    if (lastDigit === 0 || lastDigit === 1) {
      overConfidence += 20;
      reasons.push(`Very low digit ${lastDigit}, likely to revert higher`);
    } else if (lastDigit === 8 || lastDigit === 9) {
      underConfidence += 20;
      reasons.push(`Very high digit ${lastDigit}, likely to revert lower`);
    }
    
    let direction: 'OVER' | 'UNDER' | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = overConfidence;
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = underConfidence;
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 50 ? 'MODERATE' : 'WEAK';
    
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
// STRATEGY 4: BOLLINGER BANDS PRESSURE
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
    
    // Bollinger Band position analysis
    const distanceToUpper = ((bollingerUpper - currentPrice) / bollingerUpper) * 100;
    const distanceToLower = ((currentPrice - bollingerLower) / currentPrice) * 100;
    
    if (distanceToUpper < 1) {
      // Price touching upper band - expect reversal to UNDER
      underConfidence += 45;
      reasons.push('Price at upper Bollinger Band, expecting reversal down');
    } else if (distanceToLower < 1) {
      // Price touching lower band - expect reversal to OVER
      overConfidence += 45;
      reasons.push('Price at lower Bollinger Band, expecting reversal up');
    } else if (currentPrice > bollingerMiddle) {
      overConfidence += 20;
      reasons.push('Price above middle band (bullish pressure)');
    } else if (currentPrice < bollingerMiddle) {
      underConfidence += 20;
      reasons.push('Price below middle band (bearish pressure)');
    }
    
    // Band width analysis (volatility)
    const bandWidth = (bollingerUpper - bollingerLower) / bollingerMiddle;
    if (bandWidth > 0.05) {
      // High volatility - expect continuation
      if (currentPrice > bollingerMiddle) {
        overConfidence += 15;
        reasons.push('High volatility with bullish pressure');
      } else {
        underConfidence += 15;
        reasons.push('High volatility with bearish pressure');
      }
    }
    
    // Digit confirmation
    if (lastDigits.length >= 10) {
      const recentDigits = lastDigits.slice(-10);
      const overDigits = recentDigits.filter(d => d >= 5).length;
      const underDigits = recentDigits.filter(d => d <= 4).length;
      
      if (overDigits > underDigits + 2) {
        overConfidence += 20;
        reasons.push('Digit flow confirms OVER pressure');
      } else if (underDigits > overDigits + 2) {
        underConfidence += 20;
        reasons.push('Digit flow confirms UNDER pressure');
      }
    }
    
    let direction: 'OVER' | 'UNDER' | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = overConfidence;
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = underConfidence;
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 50 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// STRATEGY 5: PARABOLIC SAR FLIP
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
    
    // SAR position relative to price
    const isSarBelow = parabolicSar < currentPrice;
    const isSarAbove = parabolicSar > currentPrice;
    
    if (isSarBelow) {
      overConfidence += 50;
      reasons.push('SAR below price → UPWARD trend');
    } else if (isSarAbove) {
      underConfidence += 50;
      reasons.push('SAR above price → DOWNWARD trend');
    }
    
    // Check for SAR flip (trend change)
    const previousSarBelow = parabolicSar < previousPrice;
    const sarFlippedUp = !previousSarBelow && isSarBelow;
    const sarFlippedDown = previousSarBelow && !isSarBelow;
    
    if (sarFlippedUp) {
      overConfidence += 25;
      reasons.push('SAR just flipped UP (new uptrend)');
    } else if (sarFlippedDown) {
      underConfidence += 25;
      reasons.push('SAR just flipped DOWN (new downtrend)');
    }
    
    // Digit confirmation
    if (lastDigits.length >= 5) {
      const recentDigits = lastDigits.slice(-5);
      const overDigits = recentDigits.filter(d => d >= 5).length;
      const underDigits = recentDigits.filter(d => d <= 4).length;
      
      if (isSarBelow && overDigits >= 3) {
        overConfidence += 15;
        reasons.push('Digit flow confirms upward trend');
      } else if (isSarAbove && underDigits >= 3) {
        underConfidence += 15;
        reasons.push('Digit flow confirms downward trend');
      }
    }
    
    let direction: 'OVER' | 'UNDER' | null = null;
    let confidence = 0;
    
    if (overConfidence > underConfidence && overConfidence >= this.config.minConfidence) {
      direction = 'OVER';
      confidence = overConfidence;
    } else if (underConfidence > overConfidence && underConfidence >= this.config.minConfidence) {
      direction = 'UNDER';
      confidence = underConfidence;
    }
    
    if (!direction) return null;
    
    const strength: SignalStrength = 
      confidence >= 70 ? 'STRONG' : confidence >= 50 ? 'MODERATE' : 'WEAK';
    
    return { direction, confidence, strength, reasons };
  }
}

// ============================================
// STRATEGY 6: SMART COMBO (BEST OVERALL)
// ============================================

class SmartComboStrategy {
  private config: StrategyConfig;
  
  constructor(config: StrategyConfig) {
    this.config = config;
  }
  
  analyze(data: MarketData): Signal | null {
    const { sma5, sma10, prices, rsi, lastDigits, bollingerUpper, bollingerLower } = data;
    const currentPrice = prices[prices.length - 1] || 0;
    const reasons: string[] = [];
    let overScore = 0;
    let underScore = 0;
    let evenScore = 0;
    let oddScore = 0;
    
    // 1. TREND ANALYSIS (SMA)
    const isBullishTrend = currentPrice > sma5 && currentPrice > sma10;
    const isBearishTrend = currentPrice < sma5 && currentPrice < sma10;
    
    if (isBullishTrend) {
      overScore += 25;
      evenScore += 15;
      reasons.push('Bullish SMA trend');
    } else if (isBearishTrend) {
      underScore += 25;
      oddScore += 15;
      reasons.push('Bearish SMA trend');
    }
    
    // 2. MOMENTUM (RSI)
    if (rsi >= 55) {
      overScore += 20;
      evenScore += 20;
      reasons.push(`RSI ${rsi.toFixed(0)} shows strong momentum`);
    } else if (rsi <= 45) {
      underScore += 20;
      oddScore += 20;
      reasons.push(`RSI ${rsi.toFixed(0)} shows weak momentum`);
    }
    
    // 3. DIGIT FLOW
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
      
      if (overPercent >= 60) {
        overScore += 30;
        reasons.push(`${overPercent.toFixed(0)}% OVER digits in last 20 ticks`);
      } else if (underPercent >= 60) {
        underScore += 30;
        reasons.push(`${underPercent.toFixed(0)}% UNDER digits in last 20 ticks`);
      }
      
      if (evenPercent >= 60) {
        evenScore += 25;
        reasons.push(`${evenPercent.toFixed(0)}% EVEN digits`);
      } else if (oddPercent >= 60) {
        oddScore += 25;
        reasons.push(`${oddPercent.toFixed(0)}% ODD digits`);
      }
    }
    
    // 4. VOLATILITY (Bollinger Bands)
    const distanceToUpper = ((bollingerUpper - currentPrice) / bollingerUpper) * 100;
    const distanceToLower = ((currentPrice - bollingerLower) / currentPrice) * 100;
    
    if (distanceToUpper < 2) {
      underScore += 20;
      reasons.push('Price near upper Bollinger Band');
    } else if (distanceToLower < 2) {
      overScore += 20;
      reasons.push('Price near lower Bollinger Band');
    }
    
    // Determine best direction based on highest score
    const scores = {
      OVER: overScore,
      UNDER: underScore,
      EVEN: evenScore,
      ODD: oddScore
    };
    
    const bestDirection = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    const secondBest = Object.entries(scores).filter(d => d[0] !== bestDirection[0]).sort((a, b) => b[1] - a[1])[0];
    
    // Require clear winner and minimum confidence
    if (bestDirection[1] < this.config.minConfidence) return null;
    if (bestDirection[1] - secondBest[1] < 15) return null;
    
    const confidence = bestDirection[1];
    const strength: SignalStrength = 
      confidence >= 75 ? 'STRONG' : confidence >= 60 ? 'MODERATE' : 'WEAK';
    
    return {
      direction: bestDirection[0] as 'OVER' | 'UNDER' | 'EVEN' | 'ODD',
      confidence,
      strength,
      reasons
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
  
  // Strategy Configurations
  const [strategyConfigs, setStrategyConfigs] = useState<Record<StrategyType, StrategyConfig>>({
    trend_over_under: { enabled: true, minConfidence: 55, requireConfirmation: true },
    even_odd_momentum: { enabled: true, minConfidence: 55, requireConfirmation: true },
    digit_reversal: { enabled: true, minConfidence: 60, requireConfirmation: true },
    bollinger_pressure: { enabled: true, minConfidence: 50, requireConfirmation: true },
    parabolic_sar: { enabled: true, minConfidence: 55, requireConfirmation: true },
    smart_combo: { enabled: true, minConfidence: 60, requireConfirmation: true }
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
    
    // Update digit history
    existing.lastDigits.push(digit);
    if (existing.lastDigits.length > DIGIT_HISTORY_SIZE) existing.lastDigits.shift();
    
    // Update price history
    existing.prices.push(price);
    if (existing.prices.length > PRICE_HISTORY_SIZE) existing.prices.shift();
    
    // Update counts
    if (digit % 2 === 0) existing.evenCount++;
    else existing.oddCount++;
    
    if (digit >= 5) existing.overCount++;
    else existing.underCount++;
    
    // Calculate indicators
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
  
  // Analyze all markets for signals
  const analyzeMarkets = useCallback((): { signal: Signal; market: string; marketData: MarketData } | null => {
    const bestSignals: { signal: Signal; market: string; marketData: MarketData; confidence: number }[] = [];
    
    for (const [symbol, data] of marketDataRef.current) {
      if (data.lastDigits.length < MIN_DIGITS_FOR_ANALYSIS) continue;
      
      // Check all enabled strategies
      for (const [strategyType, config] of Object.entries(strategyConfigs)) {
        if (!config.enabled) continue;
        
        const strategy = getStrategy(strategyType as StrategyType);
        const signal = strategy.analyze(data);
        
        if (signal && signal.confidence >= config.minConfidence) {
          bestSignals.push({
            signal,
            market: symbol,
            marketData: data,
            confidence: signal.confidence
          });
        }
      }
    }
    
    if (bestSignals.length === 0) return null;
    
    // Return the highest confidence signal
    bestSignals.sort((a, b) => b.confidence - a.confidence);
    const best = bestSignals[0];
    
    return {
      signal: best.signal,
      market: best.market,
      marketData: best.marketData
    };
  }, [strategyConfigs, getStrategy]);
  
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
    
    // Map signal direction to contract type
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
      
      // Update balance
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
  
  // Main trading loop
  const startBot = useCallback(async () => {
    if (!isAuthorized || isRunning) return;
    
    const stake = parseFloat(baseStake);
    if (stake < 0.35) {
      playSound('warning');
      return;
    }
    
    // Reset state
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
    let isInRecovery = false;
    let consecutiveLossCount = 0;
    
    const maxDaily = parseFloat(maxDailyLoss);
    const maxConsecutive = parseInt(maxConsecutiveLosses);
    const tpTarget = parseFloat(takeProfit);
    const slTarget = parseFloat(stopLoss);
    
    while (runningRef.current) {
      // Check cooldown
      if (Date.now() < cooldownUntil) {
        setBotStatus('cooldown');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      // Check TP/SL
      if (netProfitRef.current >= tpTarget) {
        playSound('warning');
        break;
      }
      if (netProfitRef.current <= -slTarget) {
        playSound('warning');
        break;
      }
      
      // Check daily loss limit
      if (dailyLossRef.current >= maxDaily) {
        playSound('warning');
        break;
      }
      
      // Check consecutive losses
      if (consecutiveLossCount >= maxConsecutive) {
        playSound('warning');
        setBotStatus('cooldown');
        setCooldownUntil(Date.now() + 300000); // 5 min cooldown
        consecutiveLossCount = 0;
        continue;
      }
      
      setBotStatus('scanning');
      
      // Analyze markets for signals
      let attempts = 0;
      let analysisResult = null;
      
      while (runningRef.current && !analysisResult && attempts < MAX_SCAN_ATTEMPTS) {
        analysisResult = analyzeMarkets();
        if (!analysisResult) {
          await new Promise(r => setTimeout(r, SCAN_INTERVAL_MS));
          attempts++;
        }
      }
      
      if (!analysisResult || !runningRef.current) continue;
      
      const { signal, market, marketData } = analysisResult;
      setCurrentSignal(signal);
      setBotStatus('signal_found');
      playSound('signal');
      
      // Small delay before trading
      await new Promise(r => setTimeout(r, 500));
      
      if (!runningRef.current) break;
      
      setBotStatus('trading');
      
      // Execute trade
      const { won, pnl } = await executeTrade(
        signal,
        market,
        currentStakeAmount,
        currentStep
      );
      
      if (won) {
        // Reset after win
        currentStakeAmount = stake;
        currentStep = 0;
        isInRecovery = false;
        consecutiveLossCount = 0;
        setCurrentStake(stake);
        setMartingaleStep(0);
        setInRecovery(false);
      } else {
        // Handle loss
        consecutiveLossCount++;
        dailyLossRef.current += currentStakeAmount;
        
        if (martingaleEnabled && currentStep < parseInt(maxMartingaleSteps)) {
          currentStep++;
          currentStakeAmount = parseFloat((currentStakeAmount * parseFloat(martingaleMultiplier)).toFixed(2));
          isInRecovery = true;
          setCurrentStake(currentStakeAmount);
          setMartingaleStep(currentStep);
          setInRecovery(true);
        } else {
          // Reset after max steps
          currentStakeAmount = stake;
          currentStep = 0;
          isInRecovery = false;
          setCurrentStake(stake);
          setMartingaleStep(0);
          setInRecovery(false);
        }
      }
      
      // Small delay between trades
      await new Promise(r => setTimeout(r, 1000));
    }
    
    setIsRunning(false);
    runningRef.current = false;
    setBotStatus('idle');
    setCurrentSignal(null);
  }, [isAuthorized, isRunning, baseStake, martingaleEnabled, martingaleMultiplier, maxMartingaleSteps,
      takeProfit, stopLoss, maxDailyLoss, maxConsecutiveLosses, cooldownUntil, analyzeMarkets, executeTrade, playSound]);
  
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
    trend_over_under: { name: 'Trend O/U', icon: <TrendingUp className="w-4 h-4" />, description: 'SMA-based trend following' },
    even_odd_momentum: { name: 'Even/Odd', icon: <Activity className="w-4 h-4" />, description: 'Digit dominance momentum' },
    digit_reversal: { name: 'Reversal', icon: <ArrowUp className="w-4 h-4" />, description: 'Streak reversal detection' },
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
                    Multi-Strategy Trading Bot
                  </h1>
                  <p className="text-xs text-slate-400">6 AI-Powered Strategies | Real-time Analysis</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
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
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${
                    currentSignal?.strength === 'STRONG' ? 'bg-emerald-500/20' :
                    currentSignal?.strength === 'MODERATE' ? 'bg-amber-500/20' :
                    'bg-slate-500/20'
                  }`}>
                    {currentSignal ? (
                      currentSignal.direction === 'OVER' ? <TrendingUp className="w-5 h-5 text-emerald-400" /> :
                      currentSignal.direction === 'UNDER' ? <TrendingDown className="w-5 h-5 text-red-400" /> :
                      <Activity className="w-5 h-5 text-purple-400" />
                    ) : (
                      <Scan className="w-5 h-5 text-amber-400 animate-pulse" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">
                      {currentSignal ? `${currentSignal.direction} SIGNAL` : `${strategyNames[activeStrategy].name} ACTIVE`}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {currentSignal ? `${currentSignal.strength} • ${currentSignal.confidence}% confidence` : 'Scanning markets...'}
                    </p>
                  </div>
                </div>
                {currentSignal && (
                  <Badge className={`text-[10px] ${
                    currentSignal.strength === 'STRONG' ? 'bg-emerald-500/20 text-emerald-400' :
                    currentSignal.strength === 'MODERATE' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-slate-500/20 text-slate-400'
                  } border-0 px-3 py-1`}>
                    {currentSignal.confidence}% confidence
                  </Badge>
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
                  Analyzing {TRADING_MARKETS.length} markets for trading opportunities...
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
                            'bg-purple-500/20 text-purple-400'
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
          <div className="flex justify-center">
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
