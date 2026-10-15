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
      <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-lg w-full text-slate-900 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-black rounded-full bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-black text-white rounded-2xl">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">UOP Voice AI Assistant</h3>
            <p className="text-sm text-slate-500">Speak naturally to create or fulfill opportunities</p>
          </div>
        </div>

        {!result ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-6">
            <button
              onClick={handleStartMic}
              disabled={isListening || isLoading}
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 relative ${isListening
                  ? 'bg-black animate-ping ring-8 ring-slate-300'
                  : 'bg-black text-white hover:bg-slate-800 hover:scale-105 shadow-xl'
                }`}
            >
              {isListening ? (
                <MicOff className="w-10 h-10 text-white animate-bounce" />
              ) : (
                <Mic className="w-10 h-10 text-white" />
              )}
            </button>

            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {isListening ? 'Listening to your voice...' : 'Tap the microphone & speak your Need/Offer'}
              </p>
              {transcript && (
                <p className="text-xs text-black mt-2 italic max-w-md font-semibold">
                  &quot;{transcript}&quot;
                </p>
              )}
            </div>

            <button
              onClick={handlePresetScenario}
              className="text-xs text-slate-600 hover:text-black underline font-medium"
            >
              Simulate &quot;Srinivas 10,000 Red Bricks&quot; Voice Booking
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-black shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-900">NLU Parsing Successful</h4>
                <p className="text-xs text-slate-600 mt-1">{result.voice_reply}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Category:</span>
                <span className="font-semibold text-slate-900">{result.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Item & Quantity:</span>
                <span className="font-semibold text-slate-900">{result.item} ({result.quantity.toLocaleString()} pcs)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Location:</span>
                <span className="font-semibold text-slate-900">{result.location}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vendor Match:</span>
                <span className="font-semibold text-black">{result.suggested_vendor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Est. Price:</span>
                <span className="font-bold text-slate-900 font-mono">₹{result.estimated_amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setResult(null)}
                className="flex-1 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-xl transition"
              >
                Try Again
              </button>
              <button
                onClick={() => {
                  if (onOrderCreated) onOrderCreated(result);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-black hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-md transition flex items-center justify-center space-x-2"
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
