"use client";

import { useState, useEffect, useCallback } from "react";
import { Mic, Camera, Volume2, ChevronDown } from "lucide-react";

interface DeviceSelectorProps {
  onMicChange?: (deviceId: string) => void;
  onCameraChange?: (deviceId: string) => void;
  onSpeakerChange?: (deviceId: string) => void;
}

interface DeviceGroup {
  audioinput: MediaDeviceInfo[];
  videoinput: MediaDeviceInfo[];
  audiooutput: MediaDeviceInfo[];
}

export function DeviceSelector({ onMicChange, onCameraChange, onSpeakerChange }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<DeviceGroup>({ audioinput: [], videoinput: [], audiooutput: [] });
  const [selectedMic, setSelectedMic] = useState("");
  const [selectedCamera, setSelectedCamera] = useState("");
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const grouped: DeviceGroup = { audioinput: [], videoinput: [], audiooutput: [] };
      for (const d of allDevices) {
        if (d.kind in grouped) {
          grouped[d.kind as keyof DeviceGroup].push(d);
        }
      }
      setDevices(grouped);

      // Set defaults
      if (!selectedMic && grouped.audioinput.length > 0) setSelectedMic(grouped.audioinput[0].deviceId);
      if (!selectedCamera && grouped.videoinput.length > 0) setSelectedCamera(grouped.videoinput[0].deviceId);
      if (!selectedSpeaker && grouped.audiooutput.length > 0) setSelectedSpeaker(grouped.audiooutput[0].deviceId);
    } catch {
      // Permission not yet granted — devices will have empty labels
    }
  }, [selectedMic, selectedCamera, selectedSpeaker]);

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
  }, [loadDevices]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = () => setOpenMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [openMenu]);

  const truncate = (s: string, max = 22) => {
    if (!s || s === "") return "Default";
    return s.length > max ? s.slice(0, max) + "…" : s;
  };

  const DeviceDropdown = ({
    kind,
    icon: Icon,
    selected,
    items,
    onSelect,
  }: {
    kind: string;
    icon: typeof Mic;
    selected: string;
    items: MediaDeviceInfo[];
    onSelect: (id: string) => void;
  }) => {
    const isOpen = openMenu === kind;
    const selectedDevice = items.find((d) => d.deviceId === selected);

    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenu(isOpen ? null : kind);
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Icon className="h-3 w-3" />
          <span className="max-w-[100px] truncate">{truncate(selectedDevice?.label || "")}</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {isOpen && items.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg bg-gray-900 border border-white/10 shadow-xl py-1 z-50">
            {items.map((device) => (
              <button
                key={device.deviceId}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(device.deviceId);
                  setOpenMenu(null);
                }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  device.deviceId === selected
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {truncate(device.label, 40) || `Device ${device.deviceId.slice(0, 8)}`}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1">
      {devices.audioinput.length > 0 && (
        <DeviceDropdown
          kind="mic"
          icon={Mic}
          selected={selectedMic}
          items={devices.audioinput}
          onSelect={(id) => {
            setSelectedMic(id);
            onMicChange?.(id);
          }}
        />
      )}
      {devices.videoinput.length > 0 && (
        <DeviceDropdown
          kind="camera"
          icon={Camera}
          selected={selectedCamera}
          items={devices.videoinput}
          onSelect={(id) => {
            setSelectedCamera(id);
            onCameraChange?.(id);
          }}
        />
      )}
      {devices.audiooutput.length > 0 && (
        <DeviceDropdown
          kind="speaker"
          icon={Volume2}
          selected={selectedSpeaker}
          items={devices.audiooutput}
          onSelect={(id) => {
            setSelectedSpeaker(id);
            onSpeakerChange?.(id);
          }}
        />
      )}
    </div>
  );
}
