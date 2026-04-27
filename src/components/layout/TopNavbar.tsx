import { Button } from '@/components/ui/button';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useLossRequirement } from '@/hooks/useLossRequirement';
import {
  LayoutDashboard, BarChart3, Activity, Bot, Cpu, Zap, Users,
  History, Settings, LogOut, ChevronDown, RefreshCw,
} from 'lucide-react';
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
  { title: 'Ultimate Bots', url: '/chart', icon: Activity },
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
    <header className="sticky top-0 z-50 bg-black border-b border-gray-800">
      {/* Row 1: Logo + Theme Toggle + Balance + Account */}
      <div className="flex items-center h-12 px-4 max-w-[1920px] mx-auto">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-white text-sm">
            RAMZ<span className="text-blue-500">FX</span>
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
              <div className="flex items-center gap-1.5 bg-gray-900 rounded-lg px-3 py-1.5">
                {/* Show American flag for USD real accounts */}
                {!activeAccount.is_virtual && activeAccount.currency === 'USD' ? (
                  <span className="text-sm" role="img" aria-label="US Dollar">
                    🇺🇸
                  </span>
                ) : (
                  <span className="text-[10px] text-gray-400">
                    {activeAccount.is_virtual ? '💲' : '💵'}
                  </span>
                )}
                <span className={`font-mono text-sm font-bold ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${balance.toFixed(2)}
                </span>
              </div>

              {activeAccount.is_virtual && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-white bg-transparent hover:bg-gray-800">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-black border border-gray-800 text-white">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">Reset Demo Balance</AlertDialogTitle>
                      <AlertDialogDescription className="text-gray-400">
                        Reset account balance to $10,000? This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-gray-800 text-white border-gray-700 hover:bg-gray-700">Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetBalance} className="bg-blue-600 hover:bg-blue-700">Reset Balance</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-white bg-transparent hover:bg-gray-800">
                    {/* Show flag next to account name in trigger */}
                    {!activeAccount.is_virtual && activeAccount.currency === 'USD' && (
                      <span className="text-sm">🇺🇸</span>
                    )}
                    <span className="hidden sm:inline">{activeAccount.loginid}</span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-black border border-gray-800 text-white">
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
                        className={`${acc.loginid === activeAccount.loginid ? 'bg-gray-800' : ''} ${isRealLocked ? 'opacity-50' : ''} text-white focus:bg-gray-800 focus:text-white`}
                      >
                        <span className="mr-2 text-base">
                          {acc.is_virtual ? '🎮' : currencyFlag}
                        </span>
                        {acc.loginid} ({acc.currency})
                        {isRealLocked && <span className="ml-auto text-[9px] text-yellow-500">Locked</span>}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuItem onClick={logout} className="text-red-400 focus:text-red-400 focus:bg-gray-800">
                    <LogOut className="mr-2 h-3.5 w-3.5" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Navigation links with Button components for easier styling */}
      <div className="border-t border-gray-800 bg-black">
        {/* Scrollable container */}
        <div className="overflow-x-auto overflow-y-visible scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent hover:scrollbar-thumb-gray-600">
          <nav className="flex items-center gap-[18px] px-6 py-2 min-w-max max-w-[1920px] mx-auto">
            {navItems.map((item) => {
              return (
                <NavLink
                  key={item.url}
                  to={item.url}
                  end={item.url === '/'}
                  className={({ isActive }) => ""}
                >
                  {({ isActive }) => (
                    <Button
                      variant="default"
                      size="sm"
                      className={`
                        group relative flex items-center gap-2 px-3 py-1.5 text-sm font-bold
                        transition-all duration-300 ease-out transform
                        whitespace-nowrap shrink-0
                        bg-blue-600 text-white
                        hover:bg-blue-500 hover:scale-105 hover:shadow-[0_4px_12px_rgba(59,130,246,0.3)]
                        active:scale-95
                        ${isActive 
                          ? 'bg-blue-700 shadow-[0_2px_8px_rgba(59,130,246,0.5)] scale-[1.02]' 
                          : ''
                        }
                      `}
                    >
                      <item.icon 
                        className={`
                          w-3.5 h-3.5 transition-all duration-300 ease-out
                          text-white group-hover:rotate-12 group-hover:scale-110
                          ${isActive ? 'rotate-0 scale-100' : ''}
                        `}
                      />
                      <span className="transition-all duration-300 ease-out group-hover:translate-x-0.5 group-hover:tracking-wide">
                        {item.title}
                      </span>
                    </Button>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
                }
