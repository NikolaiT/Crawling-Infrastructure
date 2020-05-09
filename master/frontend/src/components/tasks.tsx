import React from "react";
import {Button, Tag, Layout, Table, Breadcrumb, Typography, Spin, Popconfirm, message, Dropdown, Modal, Menu, Icon} from "antd";
import {api, getDownloadUrl} from '../common/api';
import { Link } from "react-router-dom";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

const { Title } = Typography;
const { Content } = Layout;

export class Tasks extends React.Component<{}, { download_visible: boolean, download_instructions: any, crawl_options: any, tasks: any, task_details: any, selectedRowKeys: any, loading: boolean, tooltip_visible: boolean, visible: boolean, syntax: string }> {
  constructor(props: any) {
    super(props);
    this.state = {
      syntax: 'bash',
      tasks: null,
      task_details: undefined,
      selectedRowKeys: [], // Check here to configure the default column
      loading: false,
      tooltip_visible: false,
      visible: false,
      crawl_options: null,
      download_instructions: null,
      download_visible: false,
    };
  }

  loadTasks() {
    this.setState({loading: true});
    api('tasks').then((data) => {
      this.setState({
        tasks: data,
        loading: false,
      });
    }).catch((err) => {
      console.error(err);
    })
  }

  componentDidMount() {
    this.loadTasks();
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    const master_api_key = urlParams.get('master_api_key');
    const master_api_url = urlParams.get('master_api_url');
    if (master_api_key) {
      message.success('Initializing Api Key');
      document.cookie = "master_api_key=" + decodeURIComponent(master_api_key);
    }
    if (master_api_url) {
      message.success('Initializing Api Url');
      document.cookie = "master_api_url=" + decodeURIComponent(master_api_url);
    }
  }

  cancel(e: any) {
    message.error('Cancelled Event');
  }

  showModal = (record: any) => {
    this.setState({
      visible: true,
      crawl_options: record.crawl_options,
    });
  };

  showDownloadModal = (record: any) => {
    api(`storage/${record._id}?how=cmd`).then((data) => {
      this.setState({
        download_visible: true,
        download_instructions: data,
        syntax: 'bash'
      });
    }).catch((err) => {
      message.error(err.toString());
    });
  };

  showJSON = (record: any) => {
    api(`results/${record._id}?sample_size=5`).then((data) => {
      this.setState({
        download_visible: true,
        download_instructions: JSON.stringify(data, null, 1),
        syntax: 'json'
      });
    }).catch((err) => {
      message.error(err.toString());
    });
  };

  getJSONScript = (record: any) => {
    api(`storage/${record._id}?how=mergeScript`).then((data) => {
      this.setState({
        download_visible: true,
        download_instructions: data,
        syntax: 'javascript'
      });
    }).catch((err) => {
      message.error(err.toString());
    });
  };

  handleOk = (e: any) => {
    this.setState({
      visible: false,
      download_visible: false,
      crawl_options: null,
    });
  };

  handleCancel = (e: any) => {
    this.setState({
      visible: false,
      download_visible: false,
      crawl_options: null,
    });
  };

  pauseTasks() {
    let n = this.state.selectedRowKeys.length;
    this.setState({loading: true});
    for (let i = 0; i < n; i++) {
      let task_id = this.state.selectedRowKeys[i];
      api('task/' + task_id, 'PUT', {status: 'paused'}).then((response) => {
        message.success('Paused task: ' + task_id);
      }).catch((err) => {
        console.error(err);
      }).finally(() => {
        if (i+1 >= n) {
          this.setState({loading: false});
          this.loadTasks();
        }
      })
    }
  }

  resumeTasks() {
    let n = this.state.selectedRowKeys.length;
    this.setState({loading: true});
    for (let i = 0; i < n; i++) {
      let task_id = this.state.selectedRowKeys[i];
      api('task/' + task_id, 'PUT', {status: 'started'}).then((response) => {
        message.success('Resumed task ' + task_id);
      }).catch((err) => {
        message.error('Failed to resume task: ' + JSON.stringify(err));
      }).finally(() => {
        if (i+1 >= n) {
          this.setState({loading: false});
          this.loadTasks();
        }
      })
    }
  }

  deleteTasks() {
    let n = this.state.selectedRowKeys.length;
    this.setState({loading: true});
    for (let i = 0; i < n; i++) {
      let task_id = this.state.selectedRowKeys[i];
      api('task/' + task_id, 'DELETE').then((response) => {
        message.warning('Deleted task: ' + task_id);
      }).catch((err) => {
        message.error('Failed to delete task: ' + err.toString());
      }).finally(() => {
        if (i+1 >= n) {
          this.setState({loading: false});
          this.loadTasks();
        }
      })
    }
  }

  onSelectChange = (selectedRowKeys: any)=> {
    console.log('selectedRowKeys changed: ', selectedRowKeys);
    this.setState({ selectedRowKeys });
  };

  hide = () => {
    this.setState({
      tooltip_visible: false,
    });
  };

  handleVisibleChange = (tooltip_visible: boolean)=> {
    this.setState({ tooltip_visible });
  };

  getStatusColor = (text: string) => {
    if (text === "failed") {
      return 'vulcano';
    } else if (text === 'completed') {
      return 'green';
    } else if (text === 'paused') {
      return 'purple';
    } else {
      return 'blue';
    }
  };

  getWorkerTypeColor = (text: string) => {
    if (text === "http") {
      return 'geekblue';
    } else {
      return 'cyan';
    }
  };

  render() {
    const columns = [
      {
        title: 'Task Id',
        dataIndex: '_id',
        render: (text: any, record: any) => (
          <Link type="primary" to={"/edit/" + record._id}>
            {text}
          </Link>
        ),
      },
      {
        title: 'name',
        dataIndex: 'name',
        width: '10%',
        editable: true,
      },
      {
        title: 'Created At',
        dataIndex: 'createdAt',
        sorter: (a: any, b: any) => (new Date(b.createdAt)).valueOf() - (new Date(a.createdAt)).valueOf(),
      },
      {
        title: 'Worker Type',
        dataIndex: 'worker_type',
        render: (text: any, record: any) => (
          <span>
            <Tag color={this.getWorkerTypeColor(text)} key={text}>
              {text}
            </Tag>
          </span>
        )
      },
      {
        title: 'Status',
        dataIndex: 'status',
        render: (text: any, record: any) => (
          <span>
            <Tag color={this.getStatusColor(text)} key={text}>
              {text}
            </Tag>
          </span>
        )
      },
      {
        title: 'Num Items',
        dataIndex: 'num_items',
        sorter: (a: any, b: any) => a.num_items - b.num_items,
        render: (text: any, record: any) => (
          <Link type="primary" to={"/items/" + record._id}>
            {text}
          </Link>
        ),
      },
      {
        title: 'Max Items per Second',
        dataIndex: 'max_items_per_second',
        sorter: (a: any, b: any) => a.max_items_per_second - b.max_items_per_second,
      },
      {
        title: 'Max Items per Worker',
        dataIndex: 'max_items_per_worker',
        sorter: (a: any, b: any) => a.max_items_per_worker - b.max_items_per_worker,
      },
      {
        title: 'Started Workers',
        dataIndex: 'num_crawl_workers_started',
        render: (text: any, record: any) => (
          <Link
            type="primary"
            to={{
              pathname: "/workers/" + record._id,
              // @ts-ignore
              sort: {
                started: -1,
              },
              filter: {}
            }}
          >
            {text}
          </Link>
        ),
        sorter: (a: any, b: any) => a.num_crawl_workers_started - b.num_crawl_workers_started,
      },
      {
        title: 'Running Workers',
        dataIndex: 'num_workers_running',
        render: (text: any, record: any) => (
          <Link
            type="primary"
            to={{
              pathname: "/workers/" + record._id,
              // @ts-ignore
              sort: {
                started: -1,
              },
              filter: {
                status: 0,
              }
            }}
          >
            {text}
          </Link>
        ),
        sorter: (a: any, b: any) => a.num_workers_running - b.num_workers_running,
      },
      {
        title: 'Lost Workers',
        dataIndex: 'num_lost_workers',
        render: (text: any, record: any) => (
          <Link
            type="primary"
            to={{
              pathname: "/workers/" + record._id,
              // @ts-ignore
              sort: {
                started: -1,
              },
              filter: {
                status: 2,
              }
            }}
          >
            {text}
          </Link>
        ),
        sorter: (a: any, b: any) => a.num_lost_workers - b.num_lost_workers,
      },
      {
        title: 'Task Actions',
        key: 'operation',
        render: (text: any, record: any) => (
          <Dropdown overlay={
            <Menu>
              <Menu.Item key="0">
                <div>
                  <a href="#" onClick={this.showModal.bind(this, record)}>
                    Inspect Crawl Options
                  </a>
                </div>
              </Menu.Item>
              <Menu.Item key="1">
                <a href={getDownloadUrl(record._id)}>
                  Download Sample
                </a>
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item key="3">
                <Link type="default" to={"/details/" + record._id}>
                  Go to Task Details
                </Link>
              </Menu.Item>
              <Menu.Item key="4">
                <a href="#" onClick={this.showDownloadModal.bind(this, record)}>
                  Get Download Instructions
                </a>
              </Menu.Item>
              <Menu.Item key="5">
                <a href="#" onClick={this.showJSON.bind(this, record)}>
                  Get JSON results
                </a>
              </Menu.Item>
              <Menu.Item key="6">
                <a href="#" onClick={this.getJSONScript.bind(this, record)}>
                  Get JSON results script
                </a>
              </Menu.Item>
            </Menu>
            } trigger={['click']}>
            <a className="ant-dropdown-link" href="#">
              Actions <Icon type="down" />
            </a>
          </Dropdown>
        )
      },
    ];

    let {tasks} = this.state;
    let task_table;

    const { loading, selectedRowKeys } = this.state;
    const rowSelection = {
      selectedRowKeys,
      onChange: this.onSelectChange,
    };
    const hasSelected = selectedRowKeys.length > 0;

    if (tasks === null) {
      task_table = (
        <div className="centered">
          <Spin tip="Loading Tasks..." size="large" />
        </div>
      );
    } else {
      task_table = (
        <div>
          <div style={{ marginBottom: 16 }}>

            <Button type="primary" style={{ marginLeft: 8 }} onClick={this.loadTasks.bind(this)}>
              Reload
            </Button>

            <Popconfirm
              title="Do you really want to pause the selected tasks?"
              onConfirm={this.pauseTasks.bind(this)}
              onCancel={this.cancel.bind(this)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="primary" style={{ marginLeft: 8 }} disabled={!hasSelected}>
                Pause Tasks
              </Button>
            </Popconfirm>

            <Popconfirm
              title="Do you really want to resume the selected tasks?"
              onConfirm={this.resumeTasks.bind(this)}
              onCancel={this.cancel.bind(this)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="primary" style={{ marginLeft: 8 }} disabled={!hasSelected}>
                Resume Tasks
              </Button>
            </Popconfirm>

            <Popconfirm
              title="Do you really want to delete the selected tasks?"
              onConfirm={this.deleteTasks.bind(this)}
              onCancel={this.cancel.bind(this)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="danger" style={{ marginLeft: 8 }} disabled={!hasSelected}>
                Delete Tasks
              </Button>
            </Popconfirm>

            <span style={{ marginLeft: 8 }}>
            {hasSelected ? `Selected ${selectedRowKeys.length} tasks` : ''}
          </span>
          </div>

          <Table
            expandedRowRender={(record: any) => (
              <SyntaxHighlighter language="javascript" style={docco}>
                {record.function_code}
              </SyntaxHighlighter>
            )}
            rowSelection={rowSelection}
            dataSource={tasks}
            columns={columns}
            rowKey="_id"
            loading={this.state.loading}
          />

        </div>
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Tasks</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <Title level={3}>Crawl Tasks</Title>
          <p>
            A list of all the crawl tasks currently loaded into the crawling infrastructure.
          </p>

          <Modal
            title="Crawl Options"
            visible={this.state.visible}
            onOk={this.handleOk}
            onCancel={this.handleCancel}
            width={800}
          >
            <SyntaxHighlighter language="javascript" style={docco}>
              {JSON.stringify(this.state.crawl_options, null, 2)}
            </SyntaxHighlighter>
          </Modal>

          <Modal
            title="Program Source Code"
            visible={this.state.download_visible}
            onOk={this.handleOk}
            onCancel={this.handleCancel}
            width={900}
          >
            <SyntaxHighlighter language={this.state.syntax} style={docco}>
              {this.state.download_instructions}
            </SyntaxHighlighter>
          </Modal>

          {task_table}
        </div>
      </Content>
    );
  }
}