"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Camera, Mic, Wifi, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface PreCheckProps {
  onComplete: () => void;
  interviewId?: string;
  accessToken?: string;
}

export function InterviewPreCheck({ onComplete, interviewId, accessToken }: PreCheckProps) {
  const [camera, setCamera] = useState<"pending" | "pass" | "fail">("pending");
  const [mic, setMic] = useState<"pending" | "pass" | "fail">("pending");
  const [network, setNetwork] = useState<"pending" | "pass" | "fail">("pending");
  const [isChecking, setIsChecking] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const runChecks = async () => {
    setIsChecking(true);
    setCamera("pending");
    setMic("pending");
    setNetwork("pending");

    // 1. Network Check (Mocked speed test)
    await new Promise((r) => setTimeout(r, 1000));
    const isOnline = navigator.onLine;
    setNetwork(isOnline ? "pass" : "fail");

    if (!isOnline) {
      toast.error("Network connection failed.");
      setIsChecking(false);
      return;
    }

    // 2. Camera & Mic Check via getUserMedia
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setStream(mediaStream);
      
      // Check if video track exists and is enabled
      const videoTrack = mediaStream.getVideoTracks()[0];
      setCamera(videoTrack && videoTrack.enabled ? "pass" : "fail");

      // Check if audio track exists
      const audioTrack = mediaStream.getAudioTracks()[0];
      setMic(audioTrack && audioTrack.enabled ? "pass" : "fail");

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Device access denied or failed", err);
      setCamera("fail");
      setMic("fail");
      toast.error("Please allow camera and microphone permissions to proceed.");
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    runChecks();
    return () => {
      // Cleanup stream on unmount
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allPassed = camera === "pass" && mic === "pass" && network === "pass";

  const handleStart = async () => {
    // Persist readiness verification to server
    if (interviewId && accessToken) {
      try {
        await fetch(`/api/interviews/${interviewId}/validate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, action: "readiness_verified" }),
        });
      } catch {
        // Non-blocking — server will still check readinessVerified field
      }
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    onComplete();
  };

  const getStatusIcon = (status: "pending" | "pass" | "fail") => {
    if (status === "pending") return <AlertCircle className="h-5 w-5 text-yellow-500 animate-pulse" />;
    if (status === "pass") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold tracking-tight text-center mb-8">System Check</h1>
      
      <div className="grid md:grid-cols-2 gap-8">
        {/* Left Side: Video Preview */}
        <Card className="bg-black/5 dark:bg-black/40 border-muted">
          <CardHeader>
            <CardTitle>Camera Preview</CardTitle>
            <CardDescription>Ensure your face is clearly visible and well-lit.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center min-h-[300px]">
            {camera === "pass" ? (
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="w-full rounded-lg shadow-lg border-2 border-primary/20 object-cover aspect-video"
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground bg-muted rounded-lg w-full aspect-video">
                <Camera className="h-12 w-12 mb-4 opacity-50" />
                <p>Waiting for camera access...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Side: Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Requirements</CardTitle>
            <CardDescription>We need to verify your hardware before starting the AI Interview.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-primary/10 text-primary rounded-full">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Webcam</p>
                  <p className="text-sm text-muted-foreground">Required for proctoring</p>
                </div>
              </div>
              {getStatusIcon(camera)}
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-primary/10 text-primary rounded-full">
                  <Mic className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Microphone</p>
                  <p className="text-sm text-muted-foreground">Required to speak with AI</p>
                </div>
              </div>
              {getStatusIcon(mic)}
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-primary/10 text-primary rounded-full">
                  <Wifi className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Stable Connection</p>
                  <p className="text-sm text-muted-foreground">Prevents dropouts</p>
                </div>
              </div>
              {getStatusIcon(network)}
            </div>

            <div className="pt-6 border-t border-muted">
              {isChecking ? (
                <div className="text-center">
                  <Progress value={66} className="h-2 w-full animate-pulse mb-2" />
                  <p className="text-sm text-muted-foreground">Running diagnostics...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {!allPassed ? (
                    <Button variant="outline" size="lg" className="w-full" onClick={runChecks}>
                      Retry Checks
                    </Button>
                  ) : (
                    <Button size="lg" className="w-full text-lg font-semibold" onClick={handleStart}>
                      Start Interview Now
                    </Button>
                  )}
                  <p className="text-xs text-center text-muted-foreground">
                    By starting, you consent to being recorded and agree to our proctoring rules.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
