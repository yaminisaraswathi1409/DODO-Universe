'use client';

import React, { useState } from 'react';
import { Mic, MicOff, Sparkles, CheckCircle2, AlertCircle, X, Volume2 } from 'lucide-react';
import { parseVoiceOrder, VoiceParseResponse } from '@/lib/api';

interface VoiceAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderCreated?: (data: VoiceParseResponse) => void;
}

export default function VoiceAssistantModal({ isOpen, onClose, onOrderCreated }: VoiceAssistantModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VoiceParseResponse | null>(null);

  if (!isOpen) return null;

  const handlePresetScenario = async () => {
    const defaultText = "I need ten thousand red bricks delivered to my construction site in Choutuppal tomorrow morning.";
    setTranscript(defaultText);
    setIsLoading(true);
    try {
      const data = await parseVoiceOrder(defaultText);
      setResult(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartMic = () => {
    setIsListening(true);
    setTimeout(() => {
      setIsListening(false);
      handlePresetScenario();
    }, 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full text-white shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-indigo-600/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-bold">UOP Voice AI Assistant</h3>
            <p className="text-sm text-slate-400">Speak naturally to create or fulfill opportunities</p>
          </div>
        </div>

        {!result ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <button
              onClick={handleStartMic}
              disabled={isListening || isLoading}
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 relative ${
                isListening
                  ? 'bg-rose-600 animate-ping ring-8 ring-rose-500/30'
                  : 'bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 hover:scale-105 shadow-lg shadow-indigo-500/25'
              }`}
            >
              {isListening ? (
                <MicOff className="w-10 h-10 text-white animate-bounce" />
              ) : (
                <Mic className="w-10 h-10 text-white" />
              )}
            </button>

            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">
                {isListening ? 'Listening to your voice...' : 'Tap the microphone & speak your Need/Offer'}
              </p>
              {transcript && (
                <p className="text-xs text-indigo-400 mt-2 italic max-w-md">
                  &quot;{transcript}&quot;
                </p>
              )}
            </div>

            <button
              onClick={handlePresetScenario}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
            >
              Simulate &quot;Srinivas 10,000 Red Bricks&quot; Voice Booking
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-emerald-300">NLU Parsing Successful</h4>
                <p className="text-xs text-emerald-200/80 mt-1">{result.voice_reply}</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Category:</span>
                <span className="font-semibold text-indigo-400">{result.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Item & Quantity:</span>
                <span className="font-semibold text-white">{result.item} ({result.quantity.toLocaleString()} pcs)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Location:</span>
                <span className="font-semibold text-white">{result.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vendor Match:</span>
                <span className="font-semibold text-emerald-400">{result.suggested_vendor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Est. Price:</span>
                <span className="font-bold text-amber-400">${result.estimated_amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setResult(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  if (onOrderCreated) onOrderCreated(result);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center space-x-2"
              >
                <span>Confirm & Create Root Node</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
