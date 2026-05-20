import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";
import { z } from "zod";
import { Seo } from "@/components/Seo";

const emailSchema = z.string().email("Invalid email address");
const passwordSchema = z.string().min(1, "Password is required");

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Email/Password fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      emailSchema.parse(email);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Reset link sent!",
        description: "Check your email for the password reset link.",
      });
      setShowForgotPassword(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset link",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            display_name: displayName || email.split("@")[0],
          },
        },
      });

      if (error) throw error;

      toast({
        title: "Account created!",
        description: "You can now sign in with your credentials.",
      });
      setIsSignUp(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign up",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign in",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Forgot password view
  if (showForgotPassword) {
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
            <h2 className="text-xl font-semibold">Reset Password</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Enter your email to receive a reset link
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 text-base"
            />
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Reset Link
            </Button>
          </form>

          <button
            type="button"
            className="mt-6 text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
            onClick={() => setShowForgotPassword(false)}
          >
            ← Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  // Email authentication view (default)
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/10 via-background to-accent/10 px-6 py-8 safe-top">
      <Seo title="Sign in or sign up | ExpenX" description="Sign in to ExpenX to split expenses, manage groups, and track personal spending. New users can create a free account." path="/auth" />
      <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <AnimatedLogo size="md" className="h-14 w-14" />
          <div>
            <h1 className="text-2xl font-bold">ExpenX</h1>
            <p className="text-muted-foreground text-sm">Smart expense splitting</p>
          </div>
        </div>

        <form onSubmit={isSignUp ? handleEmailSignUp : handleEmailSignIn} className="space-y-4">
          {isSignUp && (
            <Input
              type="text"
              placeholder="Display Name (optional)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-12 text-base"
            />
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 text-base"
          />
          <Input
            type="password"
            placeholder={isSignUp ? "Password" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 text-base"
          />
          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSignUp ? "Sign Up" : "Sign In"}
          </Button>
        </form>

        <div className="flex justify-between mt-4">
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
          {!isSignUp && (
            <button
              type="button"
              className="text-sm text-primary hover:text-primary/80 transition-colors"
              onClick={() => setShowForgotPassword(true)}
            >
              Forgot password?
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default Auth;
