'use client';

import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, Wrench, X, CheckCircle } from 'lucide-react';
import { reportSOSIncident } from '@/lib/api';

interface SOSEmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunityId: string;
  onIncidentReported?: () => void;
}

export default function SOSEmergencyModal({ isOpen, onClose, opportunityId, onIncidentReported }: SOSEmergencyModalProps) {
  const [description, setDescription] = useState("I'm stuck on NH65, 5km past Choutuppal. The clutch has failed, the gear won't engage. Bricks are safe, but truck is off road.");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      await reportSOSIncident({
        opportunity_id: opportunityId,
        description,
        lat: 17.2500,
        lng: 78.9500,
      });
      setIsSuccess(true);
      setTimeout(() => {
        if (onIncidentReported) onIncidentReported();
        onClose();
      }, 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 max-w-lg w-full text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
            <ShieldAlert className="w-6 h-6 animate-pulse text-amber-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-amber-400">SOS Highway Breakdown Console</h3>
            <p className="text-sm text-slate-400">Triggers Incident Suspended status & Dispatches Mechanics</p>
          </div>
        </div>

        {!isSuccess ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-950/30 border border-amber-500/20 rounded-2xl text-xs text-amber-200">
              <strong>Scenario Incident Trigger:</strong> Reporting this incident will set transport status to <span className="underline">incident_suspended</span>, flag vehicle telemetry as static, and auto-spawn a nested emergency mechanic opportunity node.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Voice / Text Diagnostic Report</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Location:</span>
                <span className="text-white font-mono">NH65 Shoulder (17.2500, 78.9500)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Detected Failure:</span>
                <span className="text-rose-400 font-semibold">Clutch Assembly Failure</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-amber-600/30 transition flex items-center justify-center space-x-2"
            >
              <Wrench className="w-5 h-5" />
              <span>{isLoading ? 'Triggering Emergency Cascade...' : 'Broadcast SOS Breakdown Alert'}</span>
            </button>
          </div>
        ) : (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-lg font-bold text-white">Emergency Breakdown Registered</h4>
            <p className="text-xs text-slate-300">
              Transport status changed to <span className="font-mono text-amber-300">incident_suspended</span>.
              Emergency Mobile Mechanic (Balaji) dispatched to breakdown location!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
