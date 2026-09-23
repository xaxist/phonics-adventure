import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Yes, reset',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => (
  <Modal open={open} onClose={onCancel} title={title} icon={<TriangleAlert size={24} />}>
    <p className="confirm-message">{message}</p>
    <div className="confirm-actions">
      <Button variant="ghost" size="md" onClick={onCancel}>{cancelLabel}</Button>
      <Button variant="danger" size="md" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  </Modal>
);
