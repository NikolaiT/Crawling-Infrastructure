import React from "react";
import {api} from '../common/api';
import {Layout, Table, Breadcrumb, Popconfirm, Button, message} from "antd";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
const { Content } = Layout;

export class Machines extends React.Component<{}, {machines: any}> {
  constructor(props: any) {
    super(props);
    this.state = {
      machines: null,
    }
  }

  load() {
    api('machines').then((data) => {
      console.log(data);
      this.setState({machines: data});
    }).catch((err) => {
      console.error(err);
    })
  }

  componentDidMount() {
    this.load();
  }

  cancel(e: any) {
    message.error('Cancelled Event');
  }

  deleteMachines() {
    this.setState({machines: null});
    api('delete_machines/', 'POST', {}).then((response) => {
      message.success('Delete machines: ' + JSON.stringify(response));
      this.load();
    }).catch((err) => {
      console.error(err);
    }).finally(() => {
    })
  }

  render() {
    const columns = [
      {
        title: 'Id',
        dataIndex: '_id',
      },
      {
        title: 'Name',
        dataIndex: 'name',
      },
      {
        title: 'Type',
        dataIndex: 'type',
      },
      {
        title: 'Status',
        dataIndex: 'status',
      },
      {
        title: 'Created At',
        dataIndex: 'created',
      },
      {
        title: 'Terminated At',
        dataIndex: 'terminated',
      },
      {
        title: 'Size',
        dataIndex: 'size',
      },
      {
        title: 'Region',
        dataIndex: 'region',
      },
      {
        title: 'Elastic Ip',
        dataIndex: 'eip',
        render: (text: any, record: any) => (
          <span>
            {JSON.stringify(record.eip)}
          </span>
        )
      },
    ];

    let {machines} = this.state;
    let table;

    if (machines === null) {
      table = <div>Loading</div>;
    } else {
      table = (
        <Table
          expandedRowRender={record => (
            <SyntaxHighlighter language="json">
              {JSON.stringify(record.info, null, 2)}
            </SyntaxHighlighter>
          )}
          dataSource={machines}
          columns={columns}
          rowKey="_id" />
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Machines</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <div className="machines">
            <Popconfirm
              title="Do you really want to delete all machines?"
              onConfirm={this.deleteMachines.bind(this)}
              onCancel={this.cancel.bind(this)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="danger" style={{ marginLeft: 8 , marginBottom: 16}}>
                Delete Machines
              </Button>
            </Popconfirm>
            {table}
          </div>
        </div>
      </Content>
    )
  }
}