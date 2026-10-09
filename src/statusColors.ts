const statusColors: Record<string, string> = {
  待评估: '#8993A5',
  待处理: '#8993A5',
  待开始: '#8993A5',
  设计中: '#8A6BD1',
  进行中: '#8A6BD1',
  研发中: '#3F73E6',
  测试中: '#238FAB',
  已上线: '#279C74',
  已完成: '#279C74',
  阻塞: '#D94F63',
  挂起: '#C88719',
};

export const getStatusColor = (status: string) => statusColors[status] || '#8993A5';
