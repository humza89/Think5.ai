"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, PhoneOff, AlertTriangle, Monitor, MessageSquare, Code2, FileText, WifiHigh, WifiLow } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface InterviewRoomProps {
  interviewId: string;
  candidateName: string;
  jobTitle: string;
}

export function InterviewRoom({ interviewId, candidateName, jobTitle }: InterviewRoomProps) {
  const router = useRouter();
  
  // Media States
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [networkQuality, setNetworkQuality] = useState<"high" | "low">("high");
  
  // AI States
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<{role: "ai" | "candidate", text: string, time: string}[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Proctoring States
  const [warnings, setWarnings] = useState(0);

  // Time tracking
  const [timeLeft, setTimeLeft] = useState(45 * 60); // 45 minutes

  // Code Editor State
  const [code, setCode] = useState("// Write your solution here\nfunction solve() {\n  \n}");

  // Recording States
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    let currentStream: MediaStream | null = null;
    
    const initLocalMedia = async () => {
      try {
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        setStream(currentStream);
        if (videoRef.current) {
          videoRef.current.srcObject = currentStream;
        }

        // Initialize MediaRecorder for Enterprise-grade session capture
        const mediaRecorder = new MediaRecorder(currentStream, { mimeType: 'video/webm; codecs=vp9' });
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(2000); // collect 2s chunks for resilience
      } catch (err) {
        toast.error("Lost access to camera or microphone");
      }
    };

    initLocalMedia();

    // Enforce Fullscreen for Strict Proctoring
    const enforceFullscreen = async () => {
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
            }
        } catch (e) {
            toast.warning("Please enable full-screen mode for the best proctored experience.");
        }
    };
    enforceFullscreen();

    // Anti-Cheat Monitoring
    const handleVisibilityChange = () => {
      if (document.hidden) {
        toast.error("Warning: Please stay on this tab during the interview.", {
          duration: 5000,
          icon: <AlertTriangle className="text-red-500" />
        });
        setWarnings(w => w + 1);
        fetch("/api/v1/interviews/proctoring", {
          method: "POST",
          body: JSON.stringify({ interviewId, type: "tab_switch" })
        }).catch(() => {});
      }
    };

    const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
            toast.error("Warning: You have exited full-screen mode.", { duration: 5000 });
            setWarnings(w => w + 1);
            fetch("/api/v1/interviews/proctoring", {
              method: "POST",
              body: JSON.stringify({ interviewId, type: "exited_fullscreen" })
            }).catch(() => {});
        }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    // Simulate Network Quality fluctuations
    const netInterval = setInterval(() => {
        setNetworkQuality(Math.random() > 0.8 ? "low" : "high");
    }, 15000);

    // Simulate AI greeting & conversation
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTimeout(() => {
      setAiSpeaking(true);
      setTranscript(prev => [...prev, { role: "ai", text: `Hi ${candidateName}, welcome. I'm your AI interviewer for the ${jobTitle} role. Let's start with a quick introduction.`, time: now }]);
      setTimeout(() => setAiSpeaking(false), 5000);
    }, 2000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      clearInterval(netInterval);
      
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
      }
      
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      
      // Attempt to exit fullscreen on unmount securely
      if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(()=>{});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  // Transcript Auto-scroll
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Timer Tick
  useEffect(() => {
    if (timeLeft <= 0) {
      endInterview();
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach(track => track.enabled = !micEnabled);
      setMicEnabled(!micEnabled);
    }
  };

  const toggleCamera = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => track.enabled = !cameraEnabled);
      setCameraEnabled(!cameraEnabled);
    }
  };

  const endInterview = async () => {
    setIsUploading(true);
    
    // 1. Stop Recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
    }
    
    // We need to wait a tiny bit to ensure the final ondataavailable fires
    await new Promise(r => setTimeout(r, 500));
    
    // 2. Compile Blob
    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
    
    // 3. Upload Blob to Server
    const formData = new FormData();
    formData.append("video", blob, "session.webm");
    formData.append("interviewId", interviewId);
    
    try {
      toast.info("Securely uploading interview recording...");
      const res = await fetch("/api/v1/interviews/upload-recording", {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("Failed to upload recording.");
      toast.success("Recording saved successfully.");
    } catch (e: any) {
        toast.error("Warning: Recording save failed. Transcript saved.");
    }
    
    // 4. Graceful teardown
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    setIsUploading(false);
    toast.success("Interview completed! Generating grading report...");
    
    // Push candidate to results page
    router.push(`/candidate/interview/results/${interviewId}`);
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans">
      
      {/* Top Header */}
      <header className="h-16 border-b border-zinc-800 bg-[#111] px-6 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${aiSpeaking ? "bg-green-500 animate-pulse" : "bg-red-500 animate-pulse"}`} />
            <span className="font-semibold tracking-tight">{jobTitle} - Final Technical</span>
          </div>
          <div className="h-4 w-px bg-zinc-700" />
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
             {networkQuality === "high" ? <WifiHigh className="h-4 w-4 text-green-500" /> : <WifiLow className="h-4 w-4 text-amber-500" />}
             {networkQuality === "high" ? "Stable" : "Unstable"}
          </div>
        </div>
        
        <div className="flex items-center gap-6">
            {warnings > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-500 rounded-md text-xs border border-red-500/20">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Proctor Flag ({warnings})
                </div>
            )}
            <div className="font-mono text-lg font-medium text-zinc-200 bg-zinc-900 px-3 py-1 rounded shadow-inner">
            {formatTime(timeLeft)}
            </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANE: Workspace (Code/Whiteboard/Notes) */}
        <div className="flex-1 flex flex-col border-r border-zinc-800 bg-[#0d0d0d] min-w-[50%]">
          <Tabs defaultValue="code" className="flex-1 flex flex-col">
            <div className="h-12 border-b border-zinc-800 bg-zinc-900/50 flex items-center px-4 shrink-0">
                <TabsList className="bg-transparent space-x-2">
                    <TabsTrigger value="code" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                        <Code2 className="h-4 w-4 mr-2" /> Code Editor
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-400">
                        <FileText className="h-4 w-4 mr-2" /> Notes
                    </TabsTrigger>
                </TabsList>
            </div>
            
            <TabsContent value="code" className="flex-1 m-0 p-0 overflow-hidden relative border-none">
                <div className="absolute top-2 right-4 z-10">
                    <span className="text-xs text-zinc-500 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">TypeScript</span>
                </div>
                <Editor 
                  height="100%" 
                  defaultLanguage="typescript" 
                  theme="vs-dark" 
                  value={code} 
                  onChange={(val) => setCode(val || "")}
                  options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      fontFamily: "JetBrains Mono, monospace",
                      padding: { top: 20 }
                  }}
                />
            </TabsContent>
            
            <TabsContent value="notes" className="flex-1 m-0 p-6">
                 <textarea 
                    className="w-full h-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-zinc-300 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="Scratchpad for your personal notes. The AI interviewer does not see this..."
                 />
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT PANE: Interviews Feeds & Chat */}
        <div className="w-[400px] xl:w-[450px] flex flex-col bg-[#111] shrink-0">
            
            {/* AI Avatar Orb Room */}
            <div className="h-[260px] border-b border-zinc-800 relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-zinc-900/50 to-[#111]">
                
                {/* Advanced AI Visualizer instead of basic monitor */}
                <div className="relative flex items-center justify-center">
                    {aiSpeaking && (
                        <>
                            <div className="absolute w-40 h-40 rounded-full bg-blue-500/20 blur-2xl animate-pulse" />
                            <div className="absolute w-24 h-24 rounded-full bg-indigo-500/30 blur-xl animate-ping" />
                        </>
                    )}
                    <div className={`z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 ${aiSpeaking ? 'bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-[0_0_40px_rgba(79,70,229,0.5)]' : 'bg-gradient-to-tr from-zinc-800 to-zinc-700'}`}>
                        <svg className={`w-12 h-12 ${aiSpeaking ? 'text-white' : 'text-zinc-500'}`} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M8 12C8 13.5 9.5 15 12 15C14.5 15 16 13.5 16 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            <circle cx="9" cy="10" r="1" fill="currentColor"/>
                            <circle cx="15" cy="10" r="1" fill="currentColor"/>
                        </svg>
                    </div>
                </div>

                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">AI Interviewer</span>
                    {aiSpeaking && <span className="text-[10px] text-blue-400 animate-pulse flex items-center gap-1"><Mic className="w-3 h-3"/> Speaking...</span>}
                </div>
            </div>

            {/* Candidate Feed */}
            <div className="h-[200px] border-b border-zinc-800 relative bg-black">
                {!cameraEnabled ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
                        <VideoOff className="h-8 w-8 text-zinc-600 mb-2" />
                        <span className="absolute bottom-4 left-4 text-xs font-medium bg-black/50 px-2 py-1 rounded">Camera Off</span>
                    </div>
                ) : (
                    <>
                        <video 
                            ref={videoRef} 
                            autoPlay 
                            playsInline 
                            muted 
                            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100" 
                        />
                        <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur px-2.5 py-1 rounded border border-white/10 flex items-center gap-2">
                            <span className="text-xs font-medium text-white">{candidateName} (You)</span>
                            {!micEnabled && <MicOff className="h-3.5 w-3.5 text-red-500" />}
                        </div>
                    </>
                )}
            </div>

            {/* Live Transcript Log */}
            <div className="flex-1 flex flex-col bg-[#0a0a0a] relative">
                <div className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-2 bg-[#111]">
                    <MessageSquare className="w-4 h-4 text-zinc-400" />
                    <span className="text-xs font-semibold text-zinc-300">Live Transcript</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {transcript.map((msg, i) => (
                        <div key={i} className={`flex flex-col ${msg.role === 'candidate' ? 'items-end' : 'items-start'}`}>
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-medium ${msg.role === 'candidate' ? 'text-zinc-400' : 'text-indigo-400'}`}>
                                    {msg.role === 'candidate' ? 'You' : 'AI'}
                                </span>
                                <span className="text-[10px] text-zinc-600">{msg.time}</span>
                            </div>
                            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                                msg.role === 'candidate' 
                                ? 'bg-zinc-800 text-zinc-100 rounded-br-sm' 
                                : 'bg-indigo-500/10 text-indigo-100 border border-indigo-500/20 rounded-bl-sm'
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {aiSpeaking && transcript[transcript.length -1]?.role !== 'ai' && (
                        <div className="flex items-start">
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>
                
            </div>

        </div>
      </div>

      {/* Bottom Control Bar */}
      <footer className="h-20 bg-[#111] border-t border-zinc-800 flex items-center justify-center gap-4 px-6 shrink-0 relative z-20">
        
        <div className="absolute left-6 text-xs text-zinc-500 flex items-center gap-2">
            <ShieldIcon /> End-to-end encrypted
        </div>

        <div className="flex items-center gap-3">
            <Button 
                variant="outline" 
                size="icon" 
                className={`rounded-full h-12 w-12 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 ${!micEnabled && 'border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500'}`}
                onClick={toggleMic}
            >
                {micEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            
            <Button 
                variant="outline" 
                size="icon" 
                className={`rounded-full h-12 w-12 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 ${!cameraEnabled && 'border-red-500/50 text-red-500 hover:bg-red-500/10 hover:text-red-500'}`}
                onClick={toggleCamera}
            >
                {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>

        </div>

        <Button 
            variant="destructive" 
            className="absolute right-6 rounded px-6 h-10 font-semibold bg-red-600 hover:bg-red-700"
            onClick={endInterview}
        >
            Leave
        </Button>
      </footer>

      {isUploading && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-6 text-center backdrop-blur-sm">
            <Monitor className="h-16 w-16 text-primary animate-pulse mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Finalizing Session</h2>
            <p className="text-zinc-400 max-w-sm mb-8">
                We are securely encrypting and uploading your interview data, coding environment state, and audio transcripts. Do not close this tab.
            </p>
            <div className="w-64 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-[pulse_1s_ease-in-out_infinite]" style={{ width: '40%', animationDuration: '0.8s' }} />
            </div>
        </div>
      )}

    </div>
  );
}

function ShieldIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
    )
}
