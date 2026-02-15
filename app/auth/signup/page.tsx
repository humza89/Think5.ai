"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Marquee } from "@/components/ui/marquee";
import type { UserRole } from "@/types/supabase";
import { Mail, Lock, User, ArrowLeft, Eye, EyeOff, CheckCircle2 } from "lucide-react";

// Only Candidate and Recruiter can self-register
const roles: { value: UserRole; label: string; description: string }[] = [
  {
    value: "candidate",
    label: "Candidate",
    description: "Looking for job opportunities",
  },
  {
    value: "recruiter",
    label: "Recruiter",
    description: "Hiring for multiple companies",
  },
];

// Testimonials data
const testimonials = [
  {
    name: "Dr. Sarah Chen",
    username: "@sarahchen",
    body: "Think5 transformed how we find AI talent. Matched with perfect candidates in 24 hours!",
    img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face",
    role: "ML Lead at OpenAI",
  },
  {
    name: "James Wilson",
    username: "@jameswilson",
    body: "The quality of experts on this platform is unmatched. Found 3 PhDs for our research team.",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
    role: "CTO at Scale AI",
  },
  {
    name: "Maria Garcia",
    username: "@mariagarcia",
    body: "As a data scientist, Think5 connected me with incredible AI training opportunities.",
    img: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
    role: "Senior Data Scientist",
  },
  {
    name: "Alex Kumar",
    username: "@alexkumar",
    body: "Enterprise-grade security and seamless onboarding. Exactly what we needed.",
    img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
    role: "AI Researcher at Google",
  },
  {
    name: "Emily Zhang",
    username: "@emilyzhang",
    body: "The platform is intuitive and the talent pool is phenomenal. 10/10 recommend!",
    img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face",
    role: "NLP Expert",
  },
  {
    name: "Michael Ross",
    username: "@michaelross",
    body: "Think5 helped me transition into AI. Now working on cutting-edge LLM projects!",
    img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face",
    role: "ML Engineer at Anthropic",
  },
  {
    name: "Lisa Anderson",
    username: "@lisaanderson",
    body: "Best platform for hiring AI experts. Our team grew 5x in quality candidates.",
    img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
    role: "VP Engineering at Meta",
  },
  {
    name: "David Park",
    username: "@davidpark",
    body: "From application to first project in 48 hours. Think5 delivers on their promise!",
    img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face",
    role: "Computer Vision Expert",
  },
  {
    name: "Rachel Kim",
    username: "@rachelkim",
    body: "The vetting process ensures only top-tier talent. Quality over quantity!",
    img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face",
    role: "PhD Researcher at MIT",
  },
];

function TestimonialCard({ img, name, username, body, role }: (typeof testimonials)[number]) {
  return (
    <Card className="w-64 bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-white/20">
            <AvatarImage src={img} alt={name} />
            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-indigo-600 text-white text-sm">
              {name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <p className="text-sm font-medium text-white truncate">{name}</p>
            <p className="text-xs text-white/50 truncate">{role}</p>
          </div>
        </div>
        <blockquote className="mt-3 text-sm text-white/70 line-clamp-3">{body}</blockquote>
      </CardContent>
    </Card>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("candidate");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          role: selectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registration failed");
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("An unexpected error occurred");
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-black flex">
        {/* Left Side - Animation */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center z-10">
              <div className="w-24 h-24 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                <CheckCircle2 className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-4xl font-bold text-white mb-4">Almost there!</h2>
              <p className="text-xl text-white/80">Check your inbox to verify</p>
            </div>
          </div>
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white/10 rounded-full filter blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/20 rounded-full filter blur-3xl animate-pulse" />
        </div>

        {/* Right Side - Success Message */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-black">
          <div className="w-full max-w-md">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-semibold text-white mb-2">
                Check your email
              </h1>
              <p className="text-white/60 mb-6">
                We&apos;ve sent a confirmation link to <strong className="text-white">{email}</strong>.
                Please click the link to verify your account.
              </p>
              <Link href="/auth/signin">
                <Button className="w-full h-12 bg-white text-black hover:bg-white/90">
                  Go to Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex">
      {/* Left Side - 3D Testimonials Marquee */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900" />

        {/* Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full filter blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-indigo-500/30 rounded-full filter blur-[100px] animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-500/10 rounded-full filter blur-[80px] animate-pulse" />

        {/* Header Content */}
        <div className="absolute top-0 left-0 right-0 z-20 p-8">
          <Link href="/" className="inline-flex items-center">
            <span className="text-2xl font-bold text-white">think5</span>
            <span className="text-2xl font-bold text-blue-500">.</span>
          </Link>
          <div className="mt-8 max-w-md">
            <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
              Join the world&apos;s premier
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400"> AI talent </span>
              network
            </h1>
            <p className="text-lg text-white/60">
              Trusted by thousands of experts and companies worldwide
            </p>
          </div>
        </div>

        {/* 3D Testimonials Marquee */}
        <div className="absolute inset-0 flex items-center justify-center [perspective:400px]">
          <div
            className="flex flex-row items-center gap-4"
            style={{
              transform: 'translateX(-50px) translateY(60px) translateZ(-50px) rotateX(15deg) rotateY(-10deg) rotateZ(15deg)',
            }}
          >
            {/* Vertical Marquee Column 1 */}
            <Marquee vertical pauseOnHover repeat={3} className="[--duration:35s]">
              {testimonials.slice(0, 3).map((review) => (
                <TestimonialCard key={review.username} {...review} />
              ))}
            </Marquee>
            {/* Vertical Marquee Column 2 - Reverse */}
            <Marquee vertical pauseOnHover reverse repeat={3} className="[--duration:40s]">
              {testimonials.slice(3, 6).map((review) => (
                <TestimonialCard key={review.username} {...review} />
              ))}
            </Marquee>
            {/* Vertical Marquee Column 3 */}
            <Marquee vertical pauseOnHover repeat={3} className="[--duration:45s]">
              {testimonials.slice(6, 9).map((review) => (
                <TestimonialCard key={review.username} {...review} />
              ))}
            </Marquee>
            {/* Vertical Marquee Column 4 - Reverse */}
            <Marquee vertical pauseOnHover reverse repeat={3} className="[--duration:38s]">
              {testimonials.map((review) => (
                <TestimonialCard key={review.username + '-4'} {...review} />
              ))}
            </Marquee>
          </div>
        </div>

        {/* Gradient overlays */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black via-black/80 to-transparent z-10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black to-transparent z-10" />
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 bg-black">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-flex items-center">
              <span className="text-2xl font-bold text-white">think5</span>
              <span className="text-2xl font-bold text-blue-500">.</span>
            </Link>
          </div>

          <Link
            href="/"
            className="inline-flex items-center text-sm text-white/60 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              Create your account
            </h1>
            <p className="text-white/60">
              Start your journey with Think5 today
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Role Selection */}
            <div className="space-y-2">
              <Label className="text-white/80">I am a...</Label>
              <div className="grid grid-cols-2 gap-3">
                {roles.map((role) => (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setSelectedRole(role.value)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedRole === role.value
                        ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                    }`}
                  >
                    <p className={`font-semibold ${
                      selectedRole === role.value ? "text-blue-400" : "text-white"
                    }`}>
                      {role.label}
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {role.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-white/80">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-white/80">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">Work Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  id="email"
                  type="email"
                  placeholder="john@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-white/80">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-blue-500/50 focus:ring-blue-500/20 rounded-xl"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create account"
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-white/50 text-sm">
            By signing up, you agree to our{" "}
            <Link href="/terms" className="text-white/70 hover:text-white underline underline-offset-2">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-white/70 hover:text-white underline underline-offset-2">
              Privacy Policy
            </Link>
          </p>

          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-center text-white/60">
              Already have an account?{" "}
              <Link
                href="/auth/signin"
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
