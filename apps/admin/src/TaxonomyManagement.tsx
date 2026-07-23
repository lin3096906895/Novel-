import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { api, ContentChannel, TaxonomyCategory, TaxonomyOverview, TaxonomyTag } from './api/client';

const { Text } = Typography;
type TaxonomyKind = 'channel' | 'category' | 'tag';
type EditableTaxonomy = ContentChannel | TaxonomyCategory | TaxonomyTag;

interface EditorValues {
  code?: string;
  name: string;
  channel?: string;
  sortOrder?: number;
}

const emptyOverview: TaxonomyOverview = { channels: [], categories: [], tags: [] };

export function TaxonomyManagement({ token }: { token: string }) {
  const [overview, setOverview] = useState<TaxonomyOverview>(emptyOverview);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<{ kind: TaxonomyKind; record?: EditableTaxonomy }>();
  const [form] = Form.useForm<EditorValues>();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setOverview(await api.getTaxonomy(token));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '分类数据加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const channelNames = useMemo(
    () => new Map(overview.channels.map((channel) => [channel.code, channel.name])),
    [overview.channels],
  );

  function openEditor(kind: TaxonomyKind, record?: EditableTaxonomy) {
    setEditor({ kind, record });
    form.setFieldsValue({
      code: kind === 'channel' && record && 'code' in record ? record.code : undefined,
      name: record?.name ?? '',
      channel: kind === 'category' && record && 'channel' in record ? record.channel : undefined,
      sortOrder: record?.sortOrder ?? 0,
    });
  }

  async function save(values: EditorValues) {
    if (!editor) return;
    setIsSaving(true);
    try {
      if (editor.kind === 'channel') {
        if (editor.record) {
          await api.updateChannel(token, editor.record.id, {
            name: values.name,
            sortOrder: values.sortOrder,
          });
        } else {
          await api.createChannel(token, {
            code: values.code!,
            name: values.name,
            sortOrder: values.sortOrder,
          });
        }
      } else if (editor.kind === 'category') {
        const payload = {
          name: values.name,
          channel: values.channel!,
          sortOrder: values.sortOrder,
        };
        if (editor.record) await api.updateCategory(token, editor.record.id, payload);
        else await api.createCategory(token, payload);
      } else {
        const payload = { name: values.name, sortOrder: values.sortOrder };
        if (editor.record) await api.updateTag(token, editor.record.id, payload);
        else await api.createTag(token, payload);
      }
      message.success(editor.record ? '分类数据已更新' : '分类数据已创建');
      setEditor(undefined);
      form.resetFields();
      await load();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  }

  function remove(kind: TaxonomyKind, record: EditableTaxonomy) {
    Modal.confirm({
      title: `确认删除“${record.name}”？`,
      content: '仍被分类或作品使用的数据会被后端拒绝删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          if (kind === 'channel') await api.deleteChannel(token, record.id);
          else if (kind === 'category') await api.deleteCategory(token, record.id);
          else await api.deleteTag(token, record.id);
          message.success('删除成功');
          await load();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '删除失败');
          throw error;
        }
      },
    });
  }

  const channelColumns: ColumnsType<ContentChannel> = [
    { title: '频道', dataIndex: 'name', key: 'name' },
    { title: '代码', dataIndex: 'code', key: 'code', render: (value) => <Tag>{value}</Tag> },
    { title: '分类数', dataIndex: 'categoryCount', key: 'categoryCount', width: 100 },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
    actionColumn<ContentChannel>('channel', openEditor, remove),
  ];
  const categoryColumns: ColumnsType<TaxonomyCategory> = [
    { title: '分类', dataIndex: 'name', key: 'name' },
    {
      title: '所属频道',
      dataIndex: 'channel',
      key: 'channel',
      render: (value) => channelNames.get(value) ?? value,
    },
    { title: '作品数', key: 'novels', width: 100, render: (_, row) => row._count.novels },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
    actionColumn<TaxonomyCategory>('category', openEditor, remove),
  ];
  const tagColumns: ColumnsType<TaxonomyTag> = [
    { title: '标签', dataIndex: 'name', key: 'name' },
    { title: '作品数', key: 'novels', width: 100, render: (_, row) => row._count.novels },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 90 },
    actionColumn<TaxonomyTag>('tag', openEditor, remove),
  ];

  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <Typography.Title level={4}>频道、分类与标签</Typography.Title>
          <Text type="secondary">调整顺序后会同步影响用户端筛选和作者创建作品时的选项。</Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={isLoading} onClick={() => void load()}>
          刷新
        </Button>
      </div>
      <Tabs
        items={[
          {
            key: 'channels',
            label: `频道 ${overview.channels.length}`,
            children: (
              <TaxonomyTable
                addLabel="新增频道"
                columns={channelColumns}
                data={overview.channels}
                isLoading={isLoading}
                onAdd={() => openEditor('channel')}
              />
            ),
          },
          {
            key: 'categories',
            label: `分类 ${overview.categories.length}`,
            children: (
              <TaxonomyTable
                addLabel="新增分类"
                columns={categoryColumns}
                data={overview.categories}
                isLoading={isLoading}
                onAdd={() => openEditor('category')}
              />
            ),
          },
          {
            key: 'tags',
            label: `标签 ${overview.tags.length}`,
            children: (
              <TaxonomyTable
                addLabel="新增标签"
                columns={tagColumns}
                data={overview.tags}
                isLoading={isLoading}
                onAdd={() => openEditor('tag')}
              />
            ),
          },
        ]}
      />

      <Modal
        title={`${editor?.record ? '编辑' : '新增'}${kindLabel(editor?.kind)}`}
        open={Boolean(editor)}
        confirmLoading={isSaving}
        okText="保存"
        cancelText="取消"
        onCancel={() => setEditor(undefined)}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={(values) => void save(values)}>
          {editor?.kind === 'channel' && !editor.record && (
            <Form.Item
              label="频道代码"
              name="code"
              rules={[
                { required: true, message: '请输入频道代码' },
                {
                  pattern: /^[a-z][a-z0-9_-]{1,31}$/,
                  message: '使用小写字母、数字、下划线或短横线',
                },
              ]}
            >
              <Input placeholder="例如 male" />
            </Form.Item>
          )}
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input maxLength={30} />
          </Form.Item>
          {editor?.kind === 'category' && (
            <Form.Item
              label="所属频道"
              name="channel"
              rules={[{ required: true, message: '请选择频道' }]}
            >
              <Select
                options={overview.channels.map((item) => ({ value: item.code, label: item.name }))}
              />
            </Form.Item>
          )}
          <Form.Item label="排序值" name="sortOrder" tooltip="数字越小越靠前">
            <InputNumber min={0} max={10000} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

function TaxonomyTable<T extends { id: string }>({
  addLabel,
  columns,
  data,
  isLoading,
  onAdd,
}: {
  addLabel: string;
  columns: ColumnsType<T>;
  data: T[];
  isLoading: boolean;
  onAdd(): void;
}) {
  return (
    <>
      <div className="taxonomy-toolbar">
        <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading}
        pagination={false}
      />
    </>
  );
}

function actionColumn<T extends EditableTaxonomy>(
  kind: TaxonomyKind,
  onEdit: (kind: TaxonomyKind, record: T) => void,
  onDelete: (kind: TaxonomyKind, record: T) => void,
): ColumnsType<T>[number] {
  return {
    title: '操作',
    key: 'actions',
    width: 160,
    render: (_, record) => (
      <Space>
        <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(kind, record)}>
          编辑
        </Button>
        <Button
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => onDelete(kind, record)}
        >
          删除
        </Button>
      </Space>
    ),
  };
}

function kindLabel(kind?: TaxonomyKind) {
  return kind === 'channel' ? '频道' : kind === 'category' ? '分类' : '标签';
}
