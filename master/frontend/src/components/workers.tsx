import React from "react";
import {api} from "../common/api";
import {Layout, Table, Breadcrumb, Spin, message, Typography} from "antd";
const { Content } = Layout;
const { Title } = Typography;

export class Workers extends React.Component<{filter: any, sort: any}, {worker_meta: any, loading: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = {
      worker_meta: null,
      loading: false,
    }
  }

  load() {
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;
    let body: any = {
      id: task_id,
      // @ts-ignore
      sort: this.props.location.sort || {},
      // @ts-ignore
      filter: this.props.location.filter || {},
      limit: 500,
    };

    console.log(JSON.stringify(body));
    message.info('Fetching worker meta...');

    api('worker_meta', 'POST', body).then((data) => {
      this.setState({
        worker_meta: data,
      });
    }).catch((err) => {
      message.error(err.toString());
    })
  }

  componentDidMount() {
    this.load();
  }

  render() {
    const columns = [
      {
        title: 'Worker Id',
        dataIndex: '_id',
      },
      {
        title: 'Status',
        dataIndex: 'status',
      },
      {
        title: 'worker_id',
        dataIndex: 'worker_id',
        sorter: (a: any, b: any) => (a.worker_id - b.worker_id),
      },
      {
        title: 'started',
        dataIndex: 'started',
        sorter: (a: any, b: any) => (new Date(b.started)).valueOf() - (new Date(a.started)).valueOf(),
      },
      {
        title: 'ended',
        dataIndex: 'ended',
        sorter: (a: any, b: any) => (new Date(b.ended)).valueOf() - (new Date(a.ended)).valueOf(),
      },
      {
        title: 'average_items_per_second',
        dataIndex: 'average_items_per_second',
        sorter: (a: any, b: any) => a.average_items_per_second - b.average_items_per_second,
      },
      {
        title: 'num_items_crawled',
        dataIndex: 'num_items_crawled',
        sorter: (a: any, b: any) => a.num_items_crawled - b.num_items_crawled,
      },
      {
        title: 'num_items_failed',
        dataIndex: 'num_items_failed',
        sorter: (a: any, b: any) => a.num_items_failed - b.num_items_failed,
      },
      {
        title: 'bytes_uploaded',
        dataIndex: 'bytes_uploaded',
        sorter: (a: any, b: any) => a.bytes_uploaded - b.bytes_uploaded,
      },
      {
        title: 'region',
        dataIndex: 'region',
      },
      {
        title: 'ip',
        dataIndex: 'ip',
      },
      {
        title: 'worker_status',
        dataIndex: 'worker_status',
      },
    ];

    let {worker_meta} = this.state;
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;
    let table;

    if (worker_meta === null) {
      table = (
        <div className="centered">
          <Spin tip="Loading Worker Metadata..." size="large" />
        </div>
      );
    } else {
      table = (
        <Table dataSource={worker_meta} columns={columns} rowKey="_id" />
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Worker Meta</Breadcrumb.Item>
          <Breadcrumb.Item>{task_id}</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <Title level={2}>Worker Meta</Title>
          <div className="items">{table}</div>
        </div>
      </Content>
    )
  }
}