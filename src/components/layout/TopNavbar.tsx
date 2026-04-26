import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useLossRequirement } from '@/hooks/useLossRequirement';
import {
  LayoutDashboard, BarChart3, Activity, Bot, Cpu, Zap, Users,
  History, Settings, LogOut, ChevronDown, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { derivApi } from '@/services/deriv-api';
import { toast } from 'sonner';
import SocialIcons from './SocialIcons';
import ThemeToggle from './ThemeToggle';

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Ultimate 💥 2026-2027 Bot', url: '/chart', icon: Activity },
  { title: 'Ramzfx Analysistool', url: '/markets', icon: BarChart3 },
  { title: 'Free Bots', url: '/smart-bot', icon: Zap },
  { title: 'Advanced Tool $ Speed Bot', url: '/auto-trade', icon: Bot },
  { title: 'Copy Trading', url: '/copy-trading', icon: Users },
  { title: 'Multi-Strategy Bot', url: '/settings', icon: Settings },
];

// Helper function to get currency flag
const getCurrencyFlag = (currency: string) => {
  const flags: Record<string, string> = {
    'USD': '🇺🇸',
    'EUR': '🇪🇺',
    'GBP': '🇬🇧',
    'JPY': '🇯🇵',
    'AUD': '🇦🇺',
    'CAD': '🇨🇦',
    'CHF': '🇨🇭',
    'CNY': '🇨🇳',
    'INR': '🇮🇳',
    'BTC': '₿',
    'ETH': '⟠',
  };
  return flags[currency] || '💰';
};

export default function TopNavbar() {
  const { activeAccount, accounts, balance, logout, switchAccount } = useAuth();
  const { isUnlocked, remaining } = useLossRequirement();

  const handleResetBalance = async () => {
    try {
      const response = await derivApi['send']({ topup_virtual: 1 });
      if (response.error) {
        toast.error(response.error.message);
      } else {
        toast.success('Balance reset to $10,000');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset balance');
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
      {/* Row 1: Logo + Theme Toggle + Balance + Account */}
      <div className="flex items-center h-12 px-4 max-w-[1920px] mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground text-sm">
            RAMZ<span className="text-primary">FX</span>
          </span>
          <div className="ml-1">
            <SocialIcons />
          </div>
        </div>

        {/* Theme Toggle + Balance + Account (right-aligned) */}
        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />
          
          {activeAccount && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-muted rounded-lg px-3 py-1.5">
                {/* Show American flag for USD real accounts */}
                {!activeAccount.is_virtual && activeAccount.currency === 'USD' ? (
                  <span className="text-sm" role="img" aria-label="US Dollar">
                    🇺🇸
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {activeAccount.is_virtual ? '💲' : '💵'}
                  </span>
                )}
                <span className={`font-mono text-sm font-bold ${balance >= 0 ? 'text-profit' : 'text-loss'}`}>
                  ${balance.toFixed(2)}
                </span>
              </div>

              {activeAccount.is_virtual && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset Demo Balance</AlertDialogTitle>
                      <AlertDialogDescription>
                        Reset account balance to $10,000? This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetBalance}>Reset Balance</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1">
                    {/* Show flag next to account name in trigger */}
                    {!activeAccount.is_virtual && activeAccount.currency === 'USD' && (
                      <span className="text-sm">🇺🇸</span>
                    )}
                    <span className="hidden sm:inline">{activeAccount.loginid}</span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {accounts.map(acc => {
                    const isRealLocked = !acc.is_virtual && !isUnlocked;
                    const currencyFlag = !acc.is_virtual ? getCurrencyFlag(acc.currency) : '🎮';
                    
                    return (
                      <DropdownMenuItem
                        key={acc.loginid}
                        onClick={() => {
                          if (isRealLocked) {
                            toast.error(`Real trading locked. ${remaining} more virtual losses required.`);
                            return;
                          }
                          switchAccount(acc.loginid);
                        }}
                        className={`${acc.loginid === activeAccount.loginid ? 'bg-accent' : ''} ${isRealLocked ? 'opacity-50' : ''}`}
                      >
                        <span className="mr-2 text-base">
                          {acc.is_virtual ? '🎮' : currencyFlag}
                        </span>
                        {acc.loginid} ({acc.currency})
                        {isRealLocked && <span className="ml-auto text-[9px] text-warning">Locked</span>}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuItem onClick={logout} className="text-destructive">
                    <LogOut className="mr-2 h-3.5 w-3.5" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Navigation links with Blue/Pink styling */}
      <nav className="flex items-center gap-1 px-4 pb-2 overflow-x-auto no-scrollbar max-w-[1920px] mx-auto">
        {navItems.map((item, index) => {
          // Assign different gradient colors based on index
          const getIconGradient = () => {
            const gradients = [
              'from-blue-500 to-pink-500',
              'from-pink-500 to-purple-500',
              'from-blue-400 to-pink-400',
              'from-purple-500 to-pink-500',
              'from-blue-600 to-pink-600',
              'from-sky-500 to-pink-500',
              'from-indigo-500 to-pink-500',
            ];
            return gradients[index % gradients.length];
          };

          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === '/'}
              className={({ isActive }) => `
                group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] 
                transition-all duration-300 whitespace-nowrap shrink-0
                ${isActive 
                  ? 'bg-gradient-to-r from-blue-500/20 to-pink-500/20 text-transparent bg-clip-text font-semibold shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
                }
              `}
              activeClassName="!bg-gradient-to-r !from-blue-500/20 !to-pink-500/20"
            >
              {({ isActive }) => (
                <>
                  <item.icon 
                    className={`
                      w-3.5 h-3.5 transition-all duration-300
                      ${isActive 
                        ? `bg-gradient-to-r ${getIconGradient()} bg-clip-text text-transparent` 
                        : 'text-muted-foreground group-hover:text-pink-500 group-hover:scale-110'
                      }
                    `}
                  />
                  <span className={`
                    relative transition-all duration-300
                    ${isActive 
                      ? 'bg-gradient-to-r from-blue-500 to-pink-500 bg-clip-text text-transparent font-bold' 
                      : 'group-hover:text-pink-500'
                    }
                  `}>
                    {item.title}
                    {!isActive && (
                      <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-blue-500 to-pink-500 transition-all duration-300 group-hover:w-full"></span>
                    )}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </header>
  );
  }
