import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Settings, ScanBarcode, LogOut, User, Menu, UsersRound, TrendingUp, TrendingDown, Wallet, Users, Minus } from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { GroupSpace, PersonalSpace } from "@/components/spaces";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { Seo } from "@/components/Seo";
import { AnimatedCounter } from "@/components/investments/AnimatedCounter";
import { CreateGroupDialog } from "@/components/CreateGroupDialog";
import { AddTransactionDrawer } from "@/components/AddTransactionDrawer";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { AIAssistant } from "@/components/ai-assistant";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
type Space = "groups" | "personal";
type Group = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  created_at: string;
};
const Dashboard = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [activeSpace, setActiveSpace] = useState<Space>("groups");
  const [direction, setDirection] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNavbarVisible, setIsNavbarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [investmentsValue, setInvestmentsValue] = useState<number>(0);
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [showAddExpenseDrawer, setShowAddExpenseDrawer] = useState(false);
  const [spendingTrend, setSpendingTrend] = useState<{ current: number; previous: number; percentChange: number }>({
    current: 0,
    previous: 0,
    percentChange: 0,
  });
  const [monthlySpending, setMonthlySpending] = useState<{ month: string; amount: number }[]>([]);

  // Handle scroll to show/hide navbar
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY.current;

      // Show navbar when scrolling up, hide when scrolling down
      if (scrollDelta > 5 && currentScrollY > 60) {
        setIsNavbarVisible(false);
      } else if (scrollDelta < -5 || currentScrollY <= 10) {
        setIsNavbarVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };
    window.addEventListener("scroll", handleScroll, {
      passive: true
    });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const handleBarcodeScan = (result: string) => {
    setShowScanner(false);
    toast({
      title: "Barcode Scanned",
      description: `Code: ${result}`
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const getUserInitials = () => {
    const email = session?.user?.email;
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return "U";
  };
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (!session) {
        navigate("/");
      }
    });
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      setSession(session);
      if (!session) {
        navigate("/");
      } else {
        fetchGroups();
        fetchQuickStats();
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  // Onboarding is now handled at App level
  const fetchGroups = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("groups").select(`*, group_members!inner(user_id)`).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      setGroups(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch groups",
        variant: "destructive"
      });
    }
  };

  const fetchQuickStats = async () => {
    try {
      // Get current month and last month date ranges
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      // Fetch personal transactions balance
      const { data: transactions } = await supabase
        .from("personal_transactions")
        .select("amount, type, transaction_date");
      
      if (transactions) {
        const balance = transactions.reduce((acc, t) => {
          return t.type === "income" ? acc + Number(t.amount) : acc - Number(t.amount);
        }, 0);
        setTotalBalance(balance);

        // Calculate current month spending
        const currentMonthSpending = transactions
          .filter(t => {
            const date = new Date(t.transaction_date);
            return t.type === "expense" && date >= currentMonthStart;
          })
          .reduce((acc, t) => acc + Number(t.amount), 0);

        // Calculate last month spending
        const lastMonthSpending = transactions
          .filter(t => {
            const date = new Date(t.transaction_date);
            return t.type === "expense" && date >= lastMonthStart && date <= lastMonthEnd;
          })
          .reduce((acc, t) => acc + Number(t.amount), 0);

        // Calculate percent change
        const percentChange = lastMonthSpending > 0 
          ? ((currentMonthSpending - lastMonthSpending) / lastMonthSpending) * 100 
          : 0;

        setSpendingTrend({
          current: currentMonthSpending,
          previous: lastMonthSpending,
          percentChange,
        });

        // Calculate last 3 months spending for mini chart
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const last3Months: { month: string; amount: number }[] = [];
        
        for (let i = 2; i >= 0; i--) {
          const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
          
          const monthSpending = transactions
            .filter(t => {
              const date = new Date(t.transaction_date);
              return t.type === "expense" && date >= monthDate && date <= monthEnd;
            })
            .reduce((acc, t) => acc + Number(t.amount), 0);
          
          last3Months.push({
            month: monthNames[monthDate.getMonth()],
            amount: monthSpending,
          });
        }
        
        setMonthlySpending(last3Months);
      }

      // Fetch investments total value
      const { data: investments } = await supabase
        .from("investments")
        .select("current_value")
        .eq("is_active", true);
      
      if (investments) {
        const total = investments.reduce((acc, inv) => acc + Number(inv.current_value), 0);
        setInvestmentsValue(total);
      }
    } catch (error) {
      console.error("Error fetching quick stats:", error);
    }
  };

  const handleSpaceChange = (space: Space) => {
    setDirection(space === "personal" ? 1 : -1);
    setActiveSpace(space);
    setIsMenuOpen(false);
  };

  // Swipe gesture handling
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (isLeftSwipe && activeSpace === "groups") {
      handleSpaceChange("personal");
    } else if (isRightSwipe && activeSpace === "personal") {
      handleSpaceChange("groups");
    }
  };
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : "-100%",
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction: number) => ({
      x: direction > 0 ? "-100%" : "100%",
      opacity: 0
    })
  };
  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{
        opacity: 0,
        scale: 0.9
      }} animate={{
        opacity: 1,
        scale: 1
      }} className="flex flex-col items-center">
          <AnimatedLogo size="lg" className="mb-4" />
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </motion.div>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <Seo title="Dashboard | ExpenX" description="Your ExpenX dashboard: track group spending, personal transactions, and settlements at a glance." path="/dashboard" noindex />
      {/* Header - Hides on scroll down, shows on scroll up */}
      <motion.nav 
        className={cn(
          "fixed top-0 left-0 right-0 z-50 safe-top",
          "bg-background/80 backdrop-blur-md shadow-sm"
        )} 
        initial={{ y: 0 }} 
        animate={{ y: isNavbarVisible ? 0 : -80 }} 
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Hamburger Menu */}
            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[320px]">
                <SheetHeader className="pb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <AnimatedLogo size="sm" />
                    <span>ExpenX</span>
                  </SheetTitle>
                </SheetHeader>
                
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-3">
                    Spaces
                  </p>
                  <button
                    onClick={() => handleSpaceChange("groups")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200",
                      activeSpace === "groups" 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200",
                      activeSpace === "groups"
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                    )}>
                      <UsersRound className="h-5 w-5" />
                    </div>
                    <span className="font-medium">Group Space</span>
                  </button>
                  <button
                    onClick={() => handleSpaceChange("personal")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200",
                      activeSpace === "personal" 
                        ? "bg-primary/10 text-primary" 
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200",
                      activeSpace === "personal"
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    )}>
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <span className="font-medium">Personal Space</span>
                  </button>
                </div>

                {/* Quick Stats Section */}
                <div className="absolute bottom-6 left-4 right-4">
                  <div className="border-t border-border pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                      Quick Stats
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="h-6 w-6 rounded-full bg-blue-500/15 flex items-center justify-center">
                            <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="text-xs text-muted-foreground">Groups</span>
                        </div>
                        {isMenuOpen && (
                          <AnimatedCounter 
                            value={groups.length} 
                            className="text-lg font-bold text-foreground"
                            duration={0.8}
                          />
                        )}
                      </div>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="h-6 w-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                            <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <span className="text-xs text-muted-foreground">Balance</span>
                        </div>
                        {isMenuOpen && (
                          <AnimatedCounter 
                            value={Math.abs(totalBalance)} 
                            prefix={totalBalance >= 0 ? "+₹" : "-₹"}
                            className={cn(
                              "text-lg font-bold",
                              totalBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                            )}
                            duration={1}
                          />
                        )}
                      </div>
                    </div>
                    {investmentsValue > 0 && isMenuOpen && (
                      <div className="mt-3 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span className="text-xs text-muted-foreground">Investments</span>
                          </div>
                          <AnimatedCounter 
                            value={investmentsValue} 
                            prefix="₹"
                            className="text-sm font-bold text-foreground"
                            duration={1.2}
                          />
                        </div>
                      </div>
                    )}


                    {/* Monthly Spending Trend with Mini Bar Chart */}
                    {isMenuOpen && (
                      <div className="mt-3 bg-muted/30 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">Monthly Spending</span>
                          {spendingTrend.percentChange !== 0 ? (
                            <div className={cn(
                              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
                              spendingTrend.percentChange > 0 
                                ? "bg-destructive/15 text-destructive" 
                                : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            )}>
                              {spendingTrend.percentChange > 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              <span>{Math.abs(spendingTrend.percentChange).toFixed(0)}%</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                              <Minus className="h-3 w-3" />
                              <span>0%</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Mini Bar Chart */}
                        {monthlySpending.length > 0 && (
                          <div className="flex items-end justify-between gap-2 h-12 mb-2">
                            {(() => {
                              const maxAmount = Math.max(...monthlySpending.map(m => m.amount), 1);
                              return monthlySpending.map((month, index) => (
                                <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                                  <motion.div
                                    className={cn(
                                      "w-full rounded-t-sm",
                                      index === monthlySpending.length - 1 
                                        ? "bg-primary" 
                                        : "bg-primary/40"
                                    )}
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max((month.amount / maxAmount) * 32, 4)}px` }}
                                    transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
                                  />
                                  <span className="text-[10px] text-muted-foreground">{month.month}</span>
                                </div>
                              ));
                            })()}
                          </div>
                        )}
                        
                        <div className="flex items-baseline justify-between">
                          <div>
                            <AnimatedCounter 
                              value={spendingTrend.current} 
                              prefix="₹"
                              className="text-base font-bold text-foreground"
                              duration={1}
                            />
                            <span className="text-xs text-muted-foreground ml-1">this month</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-muted-foreground">vs ₹{spendingTrend.previous.toLocaleString("en-IN")}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            <AnimatedLogo size="sm" />
            <h1 className="text-lg font-bold text-foreground">ExpenX</h1>
          </div>
          
          <div className="flex items-center gap-2">
            {activeSpace === "groups" && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-full hover:bg-muted"
                onClick={() => setShowScanner(true)}
              >
                <ScanBarcode className="h-5 w-5" />
              </Button>
            )}
            
            <NotificationBell />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full p-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-background border shadow-lg">
                <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.nav>

      {/* Spacer for fixed header */}
      <div className="h-[72px]" />

      {/* Space Content with Slide Animation */}
      <main ref={containerRef} className="px-4 py-4 pb-24 overflow-hidden" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {/* Welcome Banner for first-time users only */}
        <WelcomeBanner 
          userName={session?.user?.email} 
          userId={session?.user?.id}
          onCreateGroup={() => setShowCreateGroupDialog(true)}
          onAddExpense={() => {
            setActiveSpace("personal");
            setShowAddExpenseDrawer(true);
          }}
        />
        
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div key={activeSpace} custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{
          x: {
            type: "spring",
            stiffness: 300,
            damping: 30
          },
          opacity: {
            duration: 0.2
          }
        }}>
            {activeSpace === "groups" ? <GroupSpace groups={groups} onGroupCreated={fetchGroups} /> : <PersonalSpace />}
          </motion.div>
        </AnimatePresence>
      </main>

      {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />}
      
      {/* Quick action dialogs triggered from welcome banner */}
      <CreateGroupDialog 
        open={showCreateGroupDialog} 
        onOpenChange={setShowCreateGroupDialog}
        onGroupCreated={() => {
          fetchGroups();
          setShowCreateGroupDialog(false);
        }}
      />
      
      <AddTransactionDrawer
        open={showAddExpenseDrawer}
        onOpenChange={setShowAddExpenseDrawer}
        onTransactionAdded={() => setShowAddExpenseDrawer(false)}
        categories={["Food & Dining", "Transport", "Shopping", "Entertainment", "Bills & Utilities", "Health", "Groceries", "Education", "Rent", "Other"]}
      />

      {/* AI Financial Assistant */}
      <AIAssistant />
    </div>;
};
export default Dashboard;