import { useRef } from 'react';
import { Input } from 'antd';
import type { Attachment } from '../types';
import FileAttachments from './FileAttachments';
import type { FileAttachmentsRef } from './FileAttachments';

interface Props {
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  images: Attachment[];
  onImagesChange: (images: Attachment[]) => void;
  onBusyChange: (busy: boolean) => void;
  label: string;
}

export default function DescriptionEditor({ id, value = '', onChange, images, onImagesChange, onBusyChange, label }: Props) {
  const upload = useRef<FileAttachmentsRef>(null);
  return <div className="description-editor" onDragOver={event => {
    if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
  }} onDrop={event => {
    if (!event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    upload.current?.addFiles(Array.from(event.dataTransfer.files));
  }}>
    <Input.TextArea id={id} aria-label={label} value={value} onChange={event => onChange?.(event.target.value)} autoSize={{ minRows: 3 }} placeholder="补充背景、目标和处理范围，可直接粘贴图片" maxLength={2000} variant="borderless" onPaste={event => {
      const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (!files.length) return;
      if (!event.clipboardData.getData('text/plain')) event.preventDefault();
      upload.current?.addFiles(files);
    }} />
    <FileAttachments ref={upload} value={images} onChange={onImagesChange} imageOnly inlineImages onBusyChange={onBusyChange} />
    <span className="description-text-count" aria-label="描述字数">{value.length} / 2000</span>
  </div>;
}
