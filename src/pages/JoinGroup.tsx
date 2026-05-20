import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { Session } from "@supabase/supabase-js";
import { Seo } from "@/components/Seo";

interface GroupInfo {
  success: boolean;
  group_name?: string;
  group_description?: string;
  error?: string;
}

const JoinGroup = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [hasAttemptedAutoJoin, setHasAttemptedAutoJoin] = useState(false);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [loadingGroupInfo, setLoadingGroupInfo] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch group info from invite code
  useEffect(() => {
    const fetchGroupInfo = async () => {
      if (!code) {
        setLoadingGroupInfo(false);
        return;
      }

      try {
        const { data, error } = await supabase.rpc("get_group_info_from_invite", {
          invite_code_param: code,
        });

        if (error) throw error;
        setGroupInfo(data as unknown as GroupInfo);
      } catch (err) {
        console.error("Error fetching group info:", err);
        setGroupInfo({ success: false, error: "Could not load group information" });
      } finally {
        setLoadingGroupInfo(false);
      }
    };

    fetchGroupInfo();
  }, [code]);

  // Render group name preview section
  const renderGroupPreview = () => {
    if (loadingGroupInfo) {
      return (
        <div className="flex items-center justify-center gap-2 py-4 mb-4 bg-muted/50 rounded-lg">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Loading group info...</span>
        </div>
      );
    }

    if (!groupInfo?.success) {
      return (
        <div className="flex items-center justify-center gap-2 py-4 mb-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-destructive text-sm">{groupInfo?.error || "Invalid invite"}</span>
        </div>
      );
    }

    return (
      <div className="py-4 px-6 mb-4 bg-primary/10 rounded-lg border border-primary/20">
        <p className="text-sm text-muted-foreground mb-1">You're joining</p>
        <h3 className="text-xl font-semibold text-foreground">{groupInfo.group_name}</h3>
        {groupInfo.group_description && (
          <p className="text-sm text-muted-foreground mt-1">{groupInfo.group_description}</p>
        )}
      </div>
    );
  };

  const performJoin = useCallback(async () => {
    if (!code || !session) return;
    
    setJoining(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("join_group_with_invite", {
        invite_code: code,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string; group_id?: string; message?: string };

      if (!result.success) {
        throw new Error(result.error || "Failed to join group");
      }

      toast({
        title: "Success!",
        description: result.message || "You've joined the group",
      });

      navigate(`/group/${result.group_id}`);
    } catch (error: any) {
      const errorMessage = error.message || "Failed to join group";
      
      if (errorMessage.includes("already a member")) {
        setError(errorMessage);
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
        setError(errorMessage);
      }
    } finally {
      setJoining(false);
    }
  }, [code, session, navigate, toast]);

  const handleJoin = () => {
    if (!session) {
      // Store the invite code and redirect to auth
      sessionStorage.setItem("pendingInviteCode", code || "");
      navigate("/auth");
      return;
    }
    performJoin();
  };

  // Auto-join if coming back from auth with pending invite
  useEffect(() => {
    if (session && code && !hasAttemptedAutoJoin && !joining && !error) {
      const pendingCode = sessionStorage.getItem("pendingInviteCode");
      if (pendingCode === code) {
        sessionStorage.removeItem("pendingInviteCode");
        setHasAttemptedAutoJoin(true);
        performJoin();
      }
    }
  }, [session, code, hasAttemptedAutoJoin, joining, error, performJoin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    const isAlreadyMember = error.includes("already a member");
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          {isAlreadyMember ? (
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          ) : (
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          )}
          <h2 className="text-2xl font-bold mb-2">
            {isAlreadyMember ? "Already a Member" : "Unable to Join"}
          </h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate("/dashboard")} className="w-full">
            Go to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="flex items-center gap-3 mb-6 justify-center">
            <AnimatedLogo size="md" />
            <h1 className="text-2xl font-bold">ExpenX</h1>
          </div>
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">You're Invited!</h2>
          {renderGroupPreview()}
          <p className="text-muted-foreground mb-6">
            Sign in to join this group and start splitting expenses
          </p>
          <Button onClick={handleJoin} className="w-full">
            Sign In to Join
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <Seo title="Join group | ExpenX" description="Accept an invite to join an ExpenX group and start splitting expenses together." path={`/join/${code ?? ""}`} noindex />
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <AnimatedLogo size="md" />
          <h1 className="text-2xl font-bold">ExpenX</h1>
        </div>

        <div className="text-center mb-6">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-4">Join Group</h2>
          {renderGroupPreview()}
        </div>

        <Button
          onClick={handleJoin}
          disabled={joining || (groupInfo && !groupInfo.success)}
          className="w-full"
        >
          {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {joining ? "Joining..." : "Join Group"}
        </Button>
      </Card>
    </div>
  );
};

export default JoinGroup;
