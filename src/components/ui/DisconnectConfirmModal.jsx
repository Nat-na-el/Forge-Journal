import React from 'react';
import { X, AlertCircle } from 'lucide-react';

export default function DisconnectConfirmModal({ isOpen, onClose, onConfirm, accountName }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2000] p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md border border-gray-700 shadow-2xl">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <AlertCircle size={20} className="text-amber-400" />
              Disconnect MT5
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200"
            >
              <X size={24} />
            </button>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Are you sure you want to disconnect MT5 from <span className="font-semibold text-white">{accountName}</span>?
          </p>
          <p className="text-sm text-gray-400 mb-6">
            All synced trades will remain, but you will be able to manually add/edit trades again. You can reconnect later.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors"
            >
              Disconnect
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
