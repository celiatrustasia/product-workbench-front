import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { App, Button, Image, Tooltip } from 'antd';
import { DeleteOutlined, DownloadOutlined, FileOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import type { Attachment } from '../types';
import { isApiMode, uploadFile } from '../data/api';

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 12;
export const isPreviewImage = (file: Attachment) => /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,/i.test(file.dataUrl) || (!!file.mime && /^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(file.mime) && file.dataUrl.startsWith('/api/files/'));
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export interface FileAttachmentsRef { addFiles: (files: File[]) => void }
interface Props {
  value: Attachment[];
  onChange?: (files: Attachment[]) => unknown | Promise<unknown>;
  imageOnly?: boolean;
  inlineImages?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export default forwardRef<FileAttachmentsRef, Props>(function FileAttachments({ value, onChange, imageOnly = false, inlineImages = false, onBusyChange }, ref) {
  const { message } = App.useApp();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, onChange, onBusyChange });
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => { latest.current = { value, onChange, onBusyChange }; }, [value, onChange, onBusyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const addFiles = async (files: File[]) => {
    if (!files.length || !latest.current.onChange) return;
    if (busyRef.current) { message.warning('文件正在处理，请稍后再添加'); return; }
    if (latest.current.value.length + files.length > MAX_FILES) { message.error(`最多添加 ${MAX_FILES} 个${imageOnly ? '图片' : '附件'}`); return; }
    const oversized = files.find(file => file.size > MAX_FILE_BYTES);
    if (oversized) { message.error(`${oversized.name} 超过 1 MB，未添加本批文件`); return; }
    if (imageOnly && files.some(file => !/^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(file.type))) { message.error('请选择 PNG、JPG、GIF、WebP、AVIF 或 BMP 图片'); return; }
    busyRef.current = true;
    setBusy(true);
    latest.current.onBusyChange?.(true);
    try {
      const attachments = await Promise.all(files.map(file => isApiMode() ? uploadFile(file) : new Promise<Attachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`无法读取 ${file.name}`));
        reader.onload = () => resolve({ id: crypto.randomUUID(), name: file.name || `图片-${Date.now()}.png`, size: file.size, dataUrl: String(reader.result) });
        reader.readAsDataURL(file);
      })));
      if (!mounted.current) return;
      const next = [...latest.current.value, ...attachments];
      await latest.current.onChange?.(next);
      latest.current.value = next;
      message.success(`已添加 ${attachments.length} 个${imageOnly ? '图片' : '附件'}`);
    } catch (error) {
      if (mounted.current) message.error(error instanceof Error ? error.message : '文件读取失败，请重试');
    } finally {
      busyRef.current = false;
      if (mounted.current) { setBusy(false); latest.current.onBusyChange?.(false); }
    }
  };
  useImperativeHandle(ref, () => ({ addFiles: files => { void addFiles(files); } }));
  const remove = async (id: string) => {
    try { await onChange?.(value.filter(file => file.id !== id)); }
    catch (error) { message.error(error instanceof Error ? error.message : '移除失败'); }
  };
  return <div className={`file-attachments ${imageOnly ? 'description-images' : ''} ${inlineImages ? 'inline-description-images' : ''}`}>
    {onChange && <div className={`file-upload-zone ${dragOver ? 'drag-over' : ''}`} onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragOver(false); void addFiles(Array.from(event.dataTransfer.files)); }}>
      <input ref={input} type="file" multiple accept={imageOnly ? 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp' : undefined} className="visually-hidden" aria-label={imageOnly ? '添加描述图片' : '上传附件'} onChange={event => { void addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <Button size={inlineImages ? 'small' : 'middle'} icon={imageOnly ? <PictureOutlined /> : <UploadOutlined />} onClick={() => input.current?.click()} loading={busy}>{imageOnly ? '添加图片' : '上传附件'}</Button><small>单个{imageOnly ? '图片' : '文件'} ≤ 1 MB · {value.length}/{MAX_FILES}</small>
    </div>}
    <Image.PreviewGroup><div className={inlineImages ? 'description-inline-gallery' : 'attachment-files'}>{value.map(file => inlineImages && isPreviewImage(file) ? <figure key={file.id} className="description-inline-image">
      <Image src={file.dataUrl} alt={file.name} width="100%" preview={{ mask: '放大查看' }} />
      <figcaption><span title={file.name}>{file.name}</span><div><Tooltip title="下载图片"><a href={file.dataUrl} download={file.name} aria-label={`下载 ${file.name}`}><DownloadOutlined /></a></Tooltip>{onChange && <Tooltip title="移除图片"><Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => remove(file.id)} /></Tooltip>}</div></figcaption>
    </figure> : <div key={file.id} className={`attachment-file ${isPreviewImage(file) ? 'has-image' : ''}`}>
      {isPreviewImage(file) ? <Image src={file.dataUrl} alt={file.name} width={104} height={78} style={{ objectFit: 'contain' }} /> : <span className="attachment-file-icon"><FileOutlined /></span>}
      <div className="attachment-file-copy"><a href={file.dataUrl} download={file.name} title={file.name}>{file.name}</a><small>{fileSize(file.size)}</small></div><div className="attachment-file-actions"><Tooltip title="下载"><a href={file.dataUrl} download={file.name} aria-label={`下载 ${file.name}`}><DownloadOutlined /></a></Tooltip>{onChange && <Tooltip title="移除"><Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => remove(file.id)} /></Tooltip>}</div>
    </div>)}</div></Image.PreviewGroup>{!value.length && !onChange && <div className="empty-inline">暂无附件</div>}
  </div>;
});
