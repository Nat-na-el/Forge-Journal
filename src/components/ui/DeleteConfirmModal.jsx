// src/components/ui/DeleteConfirmModal.jsx
import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./dialog";
import { Button } from "./button";
import { CARD, HEAD, MUTED, DIVIDER } from "../../lib/uiTokens";

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Delete",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`${CARD} max-w-md p-6`}
        aria-describedby="delete-modal-description"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#d93a57] dark:text-[#ff6b86]">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="py-4" id="delete-modal-description">
          <p className={`text-sm leading-relaxed ${MUTED}`}>{message}</p>
        </div>

        <DialogFooter className={`gap-2 border-t pt-4 sm:gap-2 ${DIVIDER}`}>
          <Button
            variant="outline"
            onClick={onClose}
            className={`border font-semibold ${DIVIDER} ${HEAD}`}
          >
            Cancel
          </Button>

          <Button
            onClick={onConfirm}
            className="font-semibold text-white shadow-none transition hover:brightness-110"
            style={{ backgroundColor: "#f2556e" }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
