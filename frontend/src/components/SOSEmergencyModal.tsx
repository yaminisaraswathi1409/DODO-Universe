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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full text-slate-900 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-black rounded-full bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-black text-white rounded-2xl">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">SOS Highway Breakdown Console</h3>
            <p className="text-sm text-slate-500">Triggers Incident Suspended status & Dispatches Mechanics</p>
          </div>
        </div>

        {!isSuccess ? (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700">
              <strong>Scenario Incident Trigger:</strong> Reporting this incident will set transport status to <span className="underline font-bold">incident_suspended</span>, flag vehicle telemetry as static, and auto-spawn a nested emergency mechanic opportunity node.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Voice / Text Diagnostic Report</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-black"
              />
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Location:</span>
                <span className="text-slate-900 font-mono">NH65 Shoulder (17.2500, 78.9500)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Detected Failure:</span>
                <span className="text-black font-semibold">Clutch Assembly Failure</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full py-3 bg-black hover:bg-slate-800 text-white font-bold text-sm rounded-xl shadow-md transition flex items-center justify-center space-x-2"
            >
              <Wrench className="w-5 h-5" />
              <span>{isLoading ? 'Triggering Emergency Cascade...' : 'Broadcast SOS Breakdown Alert'}</span>
            </button>
          </div>
        ) : (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-black mx-auto" />
            <h4 className="text-lg font-bold text-slate-900">Emergency Breakdown Registered</h4>
            <p className="text-xs text-slate-600">
              Transport status changed to <span className="font-mono text-black font-bold">incident_suspended</span>.
              Emergency Mobile Mechanic (Balaji) dispatched to breakdown location!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
