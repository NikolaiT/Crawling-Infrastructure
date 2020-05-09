import React from "react";
import {api} from "../common/api";
import {Layout, Table, Breadcrumb, Button, Popconfirm, message, Spin} from "antd";
const { Content } = Layout;

export class Proxies extends React.Component<{}, {proxies: any}> {
  constructor(props: any) {
    super(props);
    this.state = {
      proxies: null,
    }
  }

  load() {
    api('proxies').then((data) => {
      this.setState({proxies: data});
    }).catch((err) => {
      console.error(err);
    })
  }

  componentDidMount() {
    this.load();
  }

  cancel(e: any) {
    message.error('Not resetting proxies');
  }

  resetProxies() {
    this.setState({proxies: null});
    message.success('Resetting all proxies');
    api('reload_proxies', 'POST', {}).then((response) => {
      message.success('Reset all proxies: ' + JSON.stringify(response));
      this.load();
    }).catch((err) => {
      message.error('Failure resetting proxies: ' + JSON.stringify(err));
    })
  }

  render() {
    const columns = [
      {
        title: 'Id',
        dataIndex: '_id',
      },
      {
        title: 'Proxy Type',
        dataIndex: 'type',
      },
      {
        title: 'Provider',
        dataIndex: 'provider',
      },
      {
        title: 'Status',
        dataIndex: 'status',
      },
      {
        title: 'Proxy',
        dataIndex: 'proxy',
      },
      {
        title: 'Protocol',
        dataIndex: 'protocol',
      },
      {
        title: 'Whitelisted',
        dataIndex: 'whitelisted',
      },
      {
        title: 'Last used',
        dataIndex: 'last_used',
        sorter: (a: any, b: any) => (new Date(b.last_used)).valueOf() - (new Date(a.last_used)).valueOf(),
      },
      {
        title: 'Last blocked',
        dataIndex: 'last_blocked',
        sorter: (a: any, b: any) => (new Date(b.last_blocked)).valueOf() - (new Date(a.last_blocked)).valueOf(),
      },
      {
        title: 'Block counter',
        dataIndex: 'block_counter',
        sorter: (a: any, b: any) => a.block_counter - b.block_counter,
      },
      {
        title: 'Proxy fail counter',
        dataIndex: 'proxy_fail_counter',
        sorter: (a: any, b: any) => a.proxy_fail_counter - b.proxy_fail_counter,
      },
      {
        title: 'Obtain counter',
        dataIndex: 'obtain_counter',
        sorter: (a: any, b: any) => a.obtain_counter - b.obtain_counter,
      },
    ];

    let {proxies} = this.state;
    let table;

    if (proxies === null) {
      table = (
        <div className="centered">
          <Spin tip="Loading Proxies..." size="large" />
        </div>
      );
    } else {
      table = (
        <Table dataSource={proxies} columns={columns} rowKey="_id" />
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Proxies</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <div style={{ marginBottom: 16 }}>
            <Popconfirm
              title="Are you sure to reset all proxies?"
              onConfirm={this.resetProxies.bind(this)}
              onCancel={this.cancel.bind(this)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="danger">
                Reset all Proxies
              </Button>
            </Popconfirm>
          </div>
          <div className="proxies">{table}</div>
        </div>
      </Content>
    )
  }
}