import { useRef, useState } from 'react';
import { App, Switch, Tag, Tooltip } from 'antd';
import { useWorkspace } from '../data/workspace';
import type { Requirement, Task, WorkKind } from '../types';
import { canEditAll, focusReasons } from '../utils';

export default function WeeklyFocusSwitch({ kind, item }: { kind: WorkKind; item: Requirement | Task }) {
  const { user, saveWork } = useWorkspace();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const canEdit = canEditAll(item, user?.id, user?.access === '管理员');
  const automatic = focusReasons(item).includes('本周节点');
  const disabled = item.archived || !canEdit;
  const hint = item.archived ? '归档事项不能调整关注' : !canEdit ? '仅管理员、创建人或负责人可调整关注' : automatic ? '开关控制手动关注，关闭后仍会按当前周或逾期时间节点自动纳入重点关注' : '直接设置或取消手动重点关注';

  const change = async (manualFocus: boolean) => {
    if (disabled || pending.current || manualFocus === item.manualFocus) return;
    pending.current = true;
    setSaving(true);
    try {
      await saveWork(kind, { ...item, manualFocus });
      message.success(manualFocus ? '已设为手动重点关注' : automatic ? '已取消手动关注，仍按时间节点自动关注' : '已取消手动重点关注');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '关注设置保存失败，请重试');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return <div className="weekly-focus-control" onClick={event => event.stopPropagation()}>
    <Tooltip title={hint}>
      <span className="weekly-focus-switch-wrap">
        <Switch size="small" checked={item.manualFocus} checkedChildren="关注" unCheckedChildren="未关注" loading={saving} disabled={disabled} onChange={checked => { void change(checked); }} aria-label={`${item.title}的手动重点关注`} />
      </span>
    </Tooltip>
    {automatic && <Tag className="focus-tag blue">时间节点</Tag>}
  </div>;
}
