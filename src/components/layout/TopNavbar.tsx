import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useLossRequirement } from '@/hooks/useLossRequirement';
import {
  LayoutDashboard, BarChart3, Activity, Bot, Cpu, Zap, Users,
  Settings, LogOut, ChevronDown, RefreshCw,
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
  {
    title: 'Dashboard',
    url: '/',
    icon: LayoutDashboard,
    bg: 'bg-blue-500',
    border: 'border-blue-500',
    hoverText: 'hover:text-blue-600',
  },
  {
    title: 'Ultimate 💥 2026-2027 Bot',
    url: '/chart',
    icon: Activity,
    bg: 'bg-purple-500',
    border: 'border-purple-500',
    hoverText: 'hover:text-purple-600',
  },
  {
    title: 'Ramzfx Analysistool',
    url: '/markets',
    icon: BarChart3,
    bg: 'bg-green-500',
    border: 'border-green-500',
    hoverText: 'hover:text-green-600',
  },
  {
    title: 'Free Bots',
    url: '/smart-bot',
    icon: Zap,
    bg: 'bg-yellow-500',
    border: 'border-yellow-500',
    hoverText: 'hover:text-yellow-600',
  },
  {
    title: 'Advanced Tool $ Speed Bot',
    url: '/auto-trade',
    icon: Bot,
    bg: 'bg-red-500',
    border: 'border-red-500',
    hoverText: 'hover:text-red-600',
  },
  {
    title: 'Copy Trading',
    url: '/copy-trading',
    icon: Users,
    bg: 'bg-pink-500',
    border: 'border-pink-500',
    hoverText: 'hover:text-pink-600',
  },
  {
    title: 'Multi-Strategy Bot',
    url: '/settings',
    icon: Settings,
    bg: 'bg-indigo-500',
    border: 'border-indigo-500',
    hoverText: 'hover:text-indigo-600',
  },
];

const getCurrencyFlag = (currency: string) => {
  const flags: Record<string, string> = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
    AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', CNY: '🇨🇳',
    INR: '🇮🇳', BTC: '₿', ETH: '⟠',
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

      {/* TOP ROW */}
      <div className="flex items-center h-12 px-4 max-w-[1920px] mx-auto">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-white text-sm">
            RAMZ<span className="text-blue-500">FX</span>
          </span>
          <SocialIcons />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />

          {activeAccount && (
            <div className="flex items-center gap-2">

              {/* Balance */}
              <div className="flex items-center gap-1.5 bg-gray-900 rounded-lg px-3 py-1.5">
                <span className="text-xs text-gray-400">
                  {activeAccount.is_virtual ? '💲' : '💵'}
                </span>
                <span className={`font-mono text-sm font-bold ${balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${balance.toFixed(2)}
                </span>
              </div>

              {/* Reset */}
              {activeAccount.is_virtual && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" className="h-7 w-7 p-0 bg-gray-800 hover:bg-gray-700">
                      <RefreshCw className="w-3.5 h-3.5 text-white" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-black border border-gray-800 text-white">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset Demo Balance</AlertDialogTitle>
                      <AlertDialogDescription>
                        Reset to $10,000?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleResetBalance}>
                        Reset
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Account Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="text-xs bg-gray-800 hover:bg-gray-700 text-white">
                    {activeAccount.loginid}
                    <ChevronDown className="w-3 h-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent className="bg-black text-white border-gray-800">
                  {accounts.map(acc => {
                    const isRealLocked = !acc.is_virtual && !isUnlocked;
                    const currencyFlag = !acc.is_virtual ? getCurrencyFlag(acc.currency) : '🎮';

                    return (
                      <DropdownMenuItem
                        key={acc.loginid}
                        onClick={() => {
                          if (isRealLocked) {
                            toast.error(`Locked. ${remaining} losses required`);
                            return;
                          }
                          switchAccount(acc.loginid);
                        }}
                        className="text-white"
                      >
                        {currencyFlag} {acc.loginid}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuItem onClick={logout} className="text-red-400">
                    <LogOut className="mr-2 w-3 h-3" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

            </div>
          )}
        </div>
      </div>

      {/* NAV LINKS */}
      <div className="bg-black border-t border-gray-800">
        <div className="overflow-x-auto">

          <nav className="flex items-center px-4 h-12 min-w-max">

            {navItems.map(item => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === '/'}
                className={({ isActive }) => `
                  group flex items-center gap-2
                  px-4 py-2
                  mx-2
                  text-[11px]
                  font-semibold
                  rounded-[5px]
                  border
                  transition-all duration-300 ease-in-out
                  whitespace-nowrap
                  ${isActive
                    ? `${item.bg} ${item.border} text-white shadow-md scale-105`
                    : `${item.bg} ${item.border} text-white hover:bg-white ${item.hoverText} hover:shadow-lg hover:-translate-y-[2px]`
                  }
                `}
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      className={`w-3.5 h-3.5 transition-all duration-300 ${
                        isActive
                          ? 'text-white'
                          : 'text-white group-hover:rotate-6'
                      }`}
                    />
                    <span className="tracking-wide">
                      {item.title}
                    </span>
                  </>
                )}
              </NavLink>
            ))}

          </nav>

        </div>
      </div>
    </header>
  );
  }
