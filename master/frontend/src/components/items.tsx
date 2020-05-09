import React from "react";
import {api} from "../common/api";
import {Layout, Table, Breadcrumb, Spin, message, Typography, Popconfirm, Button, Modal} from "antd";
import SyntaxHighlighter from 'react-syntax-highlighter';
import {docco} from "react-syntax-highlighter/dist/esm/styles/hljs";
const { Content } = Layout;
const { Title } = Typography;

export class Items extends React.Component<{filter: any}, {results: any, visible: boolean, items: any, loading: boolean, selectedRowKeys: Array<any>}> {
  constructor(props: any) {
    super(props);
    this.state = {
      visible: false,
      results: null,
      items: null,
      loading: false,
      selectedRowKeys: [], // Check here to configure the default column
    }
  }

  load() {
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;
    let body: any = {
      id: task_id,
      select: '',
      // @ts-ignore
      filter: this.props.location.filter || {},
      limit: 1000,
    };

    message.info('Fetching items...');

    api('items', 'POST', body).then((data) => {
      this.setState({
        items: data,
      });
    }).catch((err) => {
      message.error(err.toString());
      console.error(err);
    })
  }

  cancel(e: any) {
    message.error('Cancelled Event');
  }

  runItems() {
    let items = [];
    for (let item of this.state.items) {
      if (this.state.selectedRowKeys.includes(item._id)) {
        items.push(item.item);
      }
    }

    if (items.length > 0) {
      let body = {
        // @ts-ignore
        id: (this.props.match.params as any).id,
        items: items,
      };

      this.setState({
        loading: true,
      });

      api('run/', 'POST', body).then((results) => {
        this.setState({
          visible: true,
          results: results,
        });
      }).catch((err) => {
        message.error(err.toString());
      }).finally(() => {
        this.setState({
          loading: false,
        });
      })
    }
  }

  handleOk = (e: any) => {
    this.setState({
      visible: false,
    });
  };

  handleCancel = (e: any) => {
    this.setState({
      visible: false,
    });
  };

  onSelectChange = (selectedRowKeys: any)=> {
    this.setState({ selectedRowKeys });
  };

  componentDidMount() {
    this.load();
  }

  render() {
    const columns = [
      {
        title: 'Item Id',
        dataIndex: '_id',
      },
      {
        title: 'Item',
        dataIndex: 'item',
      },
      {
        title: 'Crawled',
        dataIndex: 'crawled',
        sorter: (a: any, b: any) => (new Date(b.last_used)).valueOf() - (new Date(a.last_used)).valueOf(),
      },
      {
        title: 'Status',
        dataIndex: 'status',
      },
      {
        title: 'Retries',
        dataIndex: 'retries',
        sorter: (a: any, b: any) => a.proxy_fail_counter - b.proxy_fail_counter,
      },
      {
        title: 'Error Message',
        dataIndex: 'error',
      },
      {
        title: 'Storage Region',
        dataIndex: 'region',
      },
    ];

    let {items, selectedRowKeys} = this.state;
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;
    let table;

    const rowSelection = {
      selectedRowKeys,
      onChange: this.onSelectChange,
    };
    const hasSelected = selectedRowKeys.length > 0;

    if (items === null) {
      table = (
        <div className="centered">
          <Spin tip="Loading Items..." size="large" />
        </div>
      );
    } else {
      table = (
        <Table
          dataSource={items}
          columns={columns}
          rowKey="_id"
          rowSelection={rowSelection}
        />
      );
    }

    if (this.state.loading) {
      table = (
        <div className="centered">
          <Spin tip="Waiting for Crawl Response..." size="large" />
        </div>
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Items</Breadcrumb.Item>
          <Breadcrumb.Item>{task_id}</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <Title level={2}>Items</Title>
          <p>A table of all the items that this task contains.</p>
          <Popconfirm
            title="Do you really want to crawl the selected items?"
            onConfirm={this.runItems.bind(this)}
            onCancel={this.cancel.bind(this)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="primary" style={{ marginLeft: 8 , marginBottom: 16}}>
              Crawl Selected Items
            </Button>
          </Popconfirm>

          <Modal
            title="Results"
            visible={this.state.visible}
            onOk={this.handleOk}
            onCancel={this.handleCancel}
            width={920}
          >
            <SyntaxHighlighter language="json" style={docco}>
              {JSON.stringify(this.state.results, null, 2)}
            </SyntaxHighlighter>
          </Modal>

          <div className="items">{table}</div>
        </div>
      </Content>
    )
  }
}