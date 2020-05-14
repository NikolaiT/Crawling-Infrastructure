import React from 'react';
import "antd/dist/antd.css";
import "../index.css";
import {Row, Col, Statistic, Card, Typography, Spin, Breadcrumb, Layout, Popconfirm, Button, message} from 'antd';
import {api} from "../common/api";
import { Link } from "react-router-dom";

const { Title } = Typography;
const { Content } = Layout;

export class TaskDetails extends React.Component<{}, {task_details: any}> {
  constructor(props: any) {
    super(props);
    this.state = {
      task_details: null,
    };
  }

  load() {
    this.setState({task_details: null});
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;
    api('stats/' + task_id).then((data) => {
      this.setState({task_details: data});
    }).catch((err) => {
      console.error(err);
    });
  }

  componentDidMount(): void {
    this.load();
  }

  resetItems() {
    let body = {
      what: 'failed',
      id: this.state.task_details.id,
    };
    api('heal_queue/', 'POST', body).then((response) => {
      message.success('Reset items: ' + JSON.stringify(response));
    }).catch((err) => {
      console.error(err);
      message.error('Failed to reset queue items: ' + err.toString());
    }).finally(() => {
      this.load();
    })
  }

  cancel(e: any) {
    message.error('Cancelled Event');
  }

  render() {
    let task_details;

    if (this.state.task_details) {
      task_details = (
        <section className="taskStats">

          <Button type="primary" style={{ marginBottom: 16 }} onClick={this.load.bind(this)}>
            Reload Task Details
          </Button>

          <Title level={2}>Task Details</Title>

          <p>
            {this.state.task_details.avg_items_per_second}
          </p>

          <Title level={3}>Task Progress</Title>

          <div className="task-detail">
            <Row gutter={[16, 32]}>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="Progress last 10 min"
                    value={this.state.task_details.progress['10min']}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="Progress last 1.5h"
                    value={this.state.task_details.progress['90min']}
                  />
                </Card>
              </Col>
              <Col span={8}>
                <Card>
                  <Statistic
                    title="Progress last 12h"
                    value={this.state.task_details.progress['12h']}
                  />
                </Card>
              </Col>
            </Row>
          </div>

          <Title level={3}>Queue statistics</Title>

          <div style={{ marginBottom: 16 }}>
            <span>Resetting all failed items has only effect when the task is <em>not running</em>. </span>
            <Popconfirm
              title="Do you really want to re-enqueue all failed items?"
              onConfirm={this.resetItems.bind(this)}
              onCancel={this.cancel.bind(this)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="danger" style={{ marginLeft: 8 }}>
                Reset failed items
              </Button>
            </Popconfirm>
          </div>

          <div className="task-detail">
            <Row gutter={[16, 32]}>
              <Col span={6}>
                <Card>
                  <Link to={
                    {
                      pathname: "/items/" + this.state.task_details.id,
                      // @ts-ignore
                      filter: {
                        status: 0
                      }
                    }
                  }>
                    <Statistic
                      title="Initial Items"
                      value={this.state.task_details.queue_statistics.initial}
                      valueStyle={{ color: '#004eff' }}
                    />
                  </Link>
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Link to={
                    {
                      pathname: "/items/" + this.state.task_details.id,
                      // @ts-ignore
                      filter: {
                        status: 1
                      }
                    }
                  }>
                    <Statistic
                      title="Running Items"
                      value={this.state.task_details.queue_statistics.running}
                      valueStyle={{ color: '#008647' }}
                    />
                  </Link>
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Link to={
                    {
                      pathname: "/items/" + this.state.task_details.id,
                      // @ts-ignore
                      filter: {
                        status: 2
                      }
                    }
                  }>
                    <Statistic
                      title="Completed Items"
                      value={this.state.task_details.queue_statistics.completed}
                      valueStyle={{ color: '#108600' }}
                    />
                  </Link>
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Link to={
                    {
                      pathname: "/items/" + this.state.task_details.id,
                      // @ts-ignore
                      filter: {
                        status: 3
                      }
                    }
                  }>
                    <Statistic
                      title="Failed Items"
                      value={this.state.task_details.queue_statistics.failed}
                      valueStyle={{ color: '#ae0030' }}
                    />
                  </Link>
                </Card>
              </Col>
            </Row>
          </div>

          <Title level={3}>Task Info</Title>

          <div className="task-detail">
            <Row gutter={[16, 32]}>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Average Number of Crawled Items"
                    value={this.state.task_details.worker_meta_statistics['average number of crawled items']}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Average Number of Failed Items"
                    value={this.state.task_details.worker_meta_statistics['average number of failed items']}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Lost Workers in %"
                    value={this.state.task_details.worker_meta_statistics['lost workers in %']}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card>
                  <Statistic
                    title="Bytes Uploaded"
                    value={this.state.task_details.worker_meta_statistics['total bytes uploaded to cloud']}
                  />
                </Card>
              </Col>
            </Row>
          </div>
        </section>
      );
    }

    if (this.state.task_details === null) {
      task_details = (
        <div className="centered">
          <Spin tip="Loading..." size="large" />
        </div>
      )
    }

    // @ts-ignore
    let task_id = (this.props.match.params as any).id;

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>
            <Link to="/">Tasks
            </Link>
          </Breadcrumb.Item>
          <Breadcrumb.Item>{task_id}</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <div className="task-details">{task_details}</div>
        </div>
      </Content>
    );
  }
}