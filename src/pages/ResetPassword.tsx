import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { z } from "zod";
import { Seo } from "@/components/Seo";

const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    // Check if user came from a recovery link
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
      }
    });
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      passwordSchema.parse(password);

      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      toast({
        title: "Password updated!",
        description: "You can now sign in with your new password.",
      });
      
      // Sign out and redirect to auth
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/10 via-background to-accent/10 px-6 py-8 safe-top">
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <AnimatedLogo size="md" className="h-14 w-14" />
          <div>
            <h1 className="text-2xl font-bold">ExpenX</h1>
            <p className="text-muted-foreground text-sm">Smart expense splitting</p>
          </div>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold">Set New Password</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <Input
            type="password"
            placeholder="New Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 text-base"
          />
          <Input
            type="password"
            placeholder="Confirm New Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="h-12 text-base"
          />
          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update Password
          </Button>
        </form>

        <button
          type="button"
          className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
          onClick={() => navigate("/auth")}
        >
          ← Back to Sign In
        </button>
      </div>
    </div>
  );
};

export default ResetPassword;
