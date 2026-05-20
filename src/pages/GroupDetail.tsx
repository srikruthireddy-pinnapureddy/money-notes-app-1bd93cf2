import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Plus, 
  Receipt, 
  Users, 
  Loader2,
  TrendingUp,
  DollarSign,
  Images,
  Image as ImageIcon
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddExpenseDrawer } from "@/components/AddExpenseDrawer";
import { BatchReceiptScanner } from "@/components/BatchReceiptScanner";
import { GroupInviteDialog } from "@/components/GroupInviteDialog";
import { SettlementsSection } from "@/components/SettlementsSection";
import { EditExpenseDrawer } from "@/components/EditExpenseDrawer";
import { Seo } from "@/components/Seo";
import { DeleteExpenseDialog } from "@/components/DeleteExpenseDialog";
import { ActiveInvitesSection } from "@/components/ActiveInvitesSection";
import { FloatingChat } from "@/components/chat";
import { ExpenseComments } from "@/components/ExpenseComments";
import { ActivityFeed } from "@/components/ActivityFeed";
import { RecurringExpensesList } from "@/components/recurring";
import { SendReminderDialog } from "@/components/reminders";
import type { RealtimeChannel } from "@supabase/supabase-js";

type Group = {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: string;
  display_name: string;
  avatar_url: string | null;
};

type Expense = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  expense_date: string;
  category: string | null;
  paid_by: string;
  receipt_url: string | null;
  profiles: {
    display_name: string;
  };
  expense_splits: Array<{
    user_id: string;
    amount: number;
  }>;
};

type Balance = {
  user_id: string;
  display_name: string;
  balance: number;
};

const GroupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [batchScanOpen, setBatchScanOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [deleteExpenseDesc, setDeleteExpenseDesc] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewReceiptUrl, setViewReceiptUrl] = useState<string | null>(null);
  const [loadingReceiptUrl, setLoadingReceiptUrl] = useState(false);

  // Generate signed URL for viewing receipt
  const viewReceipt = async (receiptPath: string | null) => {
    if (!receiptPath) return;
    
    setLoadingReceiptUrl(true);
    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(receiptPath, 3600); // 1 hour expiry
      
      if (error) throw error;
      setViewReceiptUrl(data.signedUrl);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load receipt image",
        variant: "destructive",
      });
    } finally {
      setLoadingReceiptUrl(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    if (id) {
      fetchGroupData();
    }
  }, [id]);

  // Realtime subscriptions for expenses and settlements
  useEffect(() => {
    if (!id) return;

    const expensesChannel = supabase
      .channel(`expenses-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `group_id=eq.${id}`,
        },
        () => {
          // Refetch expenses when any change occurs
          fetchExpensesOnly();
        }
      )
      .subscribe();

    const settlementsChannel = supabase
      .channel(`settlements-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "settlements",
          filter: `group_id=eq.${id}`,
        },
        () => {
          // Refetch data when a settlement is recorded
          fetchExpensesOnly();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(settlementsChannel);
    };
  }, [id, members]);

  // Fetch only expenses (for realtime updates)
  const fetchExpensesOnly = useCallback(async () => {
    if (!id || members.length === 0) return;
    
    try {
      const { data: expensesData, error: expensesError } = await supabase
        .from("expenses")
        .select(`
          *,
          profiles(display_name),
          expense_splits(user_id, amount)
        `)
        .eq("group_id", id)
        .order("expense_date", { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);
      calculateBalances(members, expensesData || []);
    } catch (error: any) {
      console.error("Error fetching expenses:", error);
    }
  }, [id, members]);

  const fetchGroupData = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      setCurrentUserId(user.id);
      
      // Fetch group details
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("*")
        .eq("id", id)
        .single();

      if (groupError) throw groupError;
      setGroup(groupData);

      // Fetch members using secure function (doesn't expose phone numbers)
      const { data: memberProfiles, error: profilesError } = await supabase
        .rpc('get_group_member_profiles', { group_id_param: id });

      if (profilesError) throw profilesError;

      // Fetch member roles from group_members
      const { data: memberRoles, error: rolesError } = await supabase
        .from("group_members")
        .select("id, user_id, role")
        .eq("group_id", id);

      if (rolesError) throw rolesError;

      // Combine member profiles with their roles
      const membersData = (memberRoles || []).map(role => {
        const profile = memberProfiles?.find(p => p.id === role.user_id);
        return {
          id: role.id,
          user_id: role.user_id,
          role: role.role || 'member',
          display_name: profile?.display_name || 'Unknown',
          avatar_url: profile?.avatar_url || null,
        };
      });

      setMembers(membersData);

      // Fetch expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from("expenses")
        .select(`
          *,
          profiles(display_name),
          expense_splits(user_id, amount)
        `)
        .eq("group_id", id)
        .order("expense_date", { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);

      // Calculate balances
      calculateBalances(membersData || [], expensesData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch group data",
        variant: "destructive",
      });
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const calculateBalances = (membersList: Member[], expensesList: Expense[]) => {
    const balanceMap = new Map<string, { display_name: string; balance: number }>();

    // Initialize balances for all members
    membersList.forEach((member) => {
      balanceMap.set(member.user_id, {
        display_name: member.display_name,
        balance: 0,
      });
    });

    // Calculate balances from expenses
    expensesList.forEach((expense) => {
      // The person who paid gets credited
      const payer = balanceMap.get(expense.paid_by);
      if (payer) {
        payer.balance += Number(expense.amount);
      }

      // Everyone in the split gets debited
      expense.expense_splits.forEach((split) => {
        const member = balanceMap.get(split.user_id);
        if (member) {
          member.balance -= Number(split.amount);
        }
      });
    });

    // Convert to array
    const balanceArray = Array.from(balanceMap.entries()).map(([user_id, data]) => ({
      user_id,
      display_name: data.display_name,
      balance: data.balance,
    }));

    setBalances(balanceArray);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!group) {
    return null;
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 pb-24">
      <Seo title="Group | ExpenX" description="Manage shared expenses, settlements, and members for this ExpenX group." path={`/group/${id ?? ""}`} noindex />
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 safe-top">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate">{group.name}</h1>
              {group.description && (
                <p className="text-sm text-muted-foreground truncate">
                  {group.description}
                </p>
              )}
            </div>
            <Badge variant="outline">{group.currency}</Badge>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Spent</p>
            </div>
            <p className="text-2xl font-bold">
              {group.currency} {totalExpenses.toFixed(2)}
            </p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Expenses</p>
            </div>
            <p className="text-2xl font-bold">{expenses.length}</p>
          </Card>
        </div>

        {/* Balance Summary */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Balances
            </h2>
          </div>
          
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No balances yet
            </p>
          ) : (
            <div className="space-y-3">
              {balances.map((balance) => (
                <div key={balance.user_id} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{balance.display_name}</span>
                  <span 
                    className={`text-sm font-bold ${
                      balance.balance > 0 
                        ? "text-green-600" 
                        : balance.balance < 0 
                        ? "text-red-600" 
                        : "text-muted-foreground"
                    }`}
                  >
                    {balance.balance > 0 ? "+" : ""}
                    {group.currency} {Math.abs(balance.balance).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity Feed */}
        <ActivityFeed groupId={id!} />

        {/* Recurring Expenses */}
        <RecurringExpensesList
          groupId={id!}
          groupCurrency={group.currency}
          members={members}
          currentUserId={currentUserId!}
        />

        {/* Settlements Section */}
        <SettlementsSection
          groupId={id!}
          groupCurrency={group.currency}
          balances={balances}
          onSettled={fetchGroupData}
        />

        {/* Active Invite Codes - Admin Only */}
        <ActiveInvitesSection
          groupId={id!}
          isAdmin={members.some(m => m.user_id === currentUserId && m.role === 'admin')}
        />

        {/* Members - Compact Interactive */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Members</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setInviteOpen(true)}>
            + Invite
          </Button>
        </div>
        
        <div className="flex items-center gap-1 flex-wrap">
          {members.map((member, index) => (
            <div
              key={member.id}
              className="group relative"
              style={{ zIndex: members.length - index }}
            >
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-all duration-200 cursor-pointer
                  hover:scale-110 hover:z-50 hover:shadow-lg
                  ${member.role === 'admin' 
                    ? 'bg-gradient-to-br from-primary to-accent text-primary-foreground ring-2 ring-primary/30' 
                    : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                  }
                `}
              >
                {member.display_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border">
                <span className="font-medium">{member.display_name}</span>
                {member.role === 'admin' && (
                  <span className="ml-1 text-primary">• Admin</span>
                )}
              </div>
            </div>
          ))}
          
          {/* Add member button */}
          <button
            onClick={() => setInviteOpen(true)}
            className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-200"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>


        {/* Expenses List */}
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Recent Expenses
          </h2>
          
          {expenses.length === 0 ? (
            <Card className="p-8 text-center">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-base font-semibold mb-2">No expenses yet</h3>
              <p className="text-sm text-muted-foreground">
                Add your first expense to get started
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {expenses.map((expense) => {
                const isCreator = expense.paid_by === currentUserId;
                
                return (
                  <Card key={expense.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {expense.description}
                          </p>
                          {expense.receipt_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => viewReceipt(expense.receipt_url)}
                              disabled={loadingReceiptUrl}
                            >
                              {loadingReceiptUrl ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <ImageIcon className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Paid by {expense.profiles.display_name}
                        </p>
                        {expense.category && (
                          <Badge variant="outline" className="text-xs mt-2">
                            {expense.category}
                          </Badge>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-base">
                          {group.currency} {Number(expense.amount).toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(expense.expense_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <Separator className="my-3" />
                    
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Split between {expense.expense_splits.length} members
                      </p>
                      
                      {isCreator && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditExpense(expense)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setDeleteExpenseId(expense.id);
                              setDeleteExpenseDesc(expense.description);
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Expense Comments */}
                    <ExpenseComments
                      expenseId={expense.id}
                      groupId={id!}
                      currentUserId={currentUserId!}
                    />
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Floating Chat */}
      <FloatingChat
        groupId={id!}
        groupName={group.name}
        groupCurrency={group.currency}
        currentUserId={currentUserId!}
        members={members}
        balances={balances}
        onExpenseAdded={fetchGroupData}
      />

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 z-20 safe-bottom flex flex-col gap-3">
        <Button 
          size="lg" 
          variant="secondary"
          className="h-14 w-14 rounded-full shadow-xl"
          onClick={() => setBatchScanOpen(true)}
          title="Batch scan receipts"
        >
          <Images className="h-6 w-6" />
        </Button>
        <Button 
          size="lg" 
          className="h-16 w-16 rounded-full shadow-2xl"
          onClick={() => setAddExpenseOpen(true)}
        >
          <Plus className="h-7 w-7" />
        </Button>
      </div>

      <AddExpenseDrawer
        open={addExpenseOpen}
        onOpenChange={setAddExpenseOpen}
        groupId={id!}
        groupCurrency={group.currency}
        members={members}
        onExpenseAdded={fetchGroupData}
      />

      <BatchReceiptScanner
        open={batchScanOpen}
        onOpenChange={setBatchScanOpen}
        groupId={id!}
        groupCurrency={group.currency}
        members={members}
        onExpensesAdded={fetchGroupData}
      />

      <GroupInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        groupId={id!}
        groupName={group.name}
      />

      <EditExpenseDrawer
        open={editExpense !== null}
        onOpenChange={(open) => !open && setEditExpense(null)}
        expense={editExpense}
        groupCurrency={group.currency}
        members={members}
        onExpenseUpdated={fetchGroupData}
      />

      <DeleteExpenseDialog
        open={deleteExpenseId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteExpenseId(null);
            setDeleteExpenseDesc("");
          }
        }}
        expenseId={deleteExpenseId}
        expenseDescription={deleteExpenseDesc}
        onExpenseDeleted={fetchGroupData}
      />

      {/* Receipt Viewer Dialog */}
      <Dialog open={viewReceiptUrl !== null} onOpenChange={(open) => !open && setViewReceiptUrl(null)}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Receipt</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {viewReceiptUrl && (
              <img
                src={viewReceiptUrl}
                alt="Receipt"
                className="w-full max-h-[70vh] object-contain rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GroupDetail;
