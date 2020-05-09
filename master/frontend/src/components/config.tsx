import React from 'react';
import "antd/dist/antd.css";
import "../index.css";
import {api} from "../common/api";
import {
  Form,
  Tooltip,
  Icon,
  Select,
  Row,
  Col,
  Button,
  Switch,
  InputNumber,
  Typography, Spin, Breadcrumb, Layout, message, Popconfirm
} from 'antd';

const { Title } = Typography;
const { Content } = Layout;
const { Option } = Select;

export class Config extends React.Component<{form: any}, {config: any}> {
  constructor(props: any) {
    super(props);
    this.state = {
      config: null,
    };
  }

  load() {
    this.setState({config: null});
    api('config/', 'GET').then((config) => {
      this.setState({config: config});
    }).catch((err) => {
      console.error(err);
    });
  }

  componentDidMount(): void {
    this.load();
  }

  cancel(e: any) {
    message.error('Cancelled Event');
  }

  resetConfig() {
    api('config/', 'POST', {}).then((response) => {
      message.success('Reset config to defaults');
      this.load();
    }).catch((err) => {
      message.error(`Could not reset config: ${err}`);
    }).finally(() => {
    })
  }

  handleSubmit = (e: any) => {
    e.preventDefault();
    this.props.form.validateFieldsAndScroll((err: any, values: any) => {
      if (!err) {
        this.setState({config: null});
        api('config/', 'PUT', values).then((data) => {
          message.success('Successfully updated config.');
          this.setState({config: data});
        }).catch((err) => {
          message.error('Failed to update config: ' + err.toString());
        });
      }
    });
  };

  render() {
    let config;

    const { getFieldDecorator } = this.props.form;

    const formItemLayout = {
      labelCol: {
        xs: { span: 24 },
        sm: { span: 8 },
      },
      wrapperCol: {
        xs: { span: 24 },
        sm: { span: 16 },
      },
    };

    if (this.state.config === null) {
      config = (
        <div className="centered">
          <Spin tip="Loading..." size="large" />
        </div>
      )
    } else {
      config = (
        <Form {...formItemLayout} onSubmit={this.handleSubmit} layout="vertical">

          <Form.Item label={
            <span>
              Daemon Heartbeat in ms&nbsp;
              <Tooltip title="The scheduler heartbeat. The time interval when the scheduler is waking up and checking for progress to be made.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('daemon_heartbeat', { initialValue: this.state.config.daemon_heartbeat })(<InputNumber min={1000} max={100000} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Worker Lost Threshold in minutes&nbsp;
              <Tooltip title="After how many minutes a Lambda/Functions worker is deemed to be lost if it failed to communicate it's status.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('worker_lost_threshold_minutes', { initialValue: this.state.config.worker_lost_threshold_minutes })(<InputNumber min={6} max={200} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Docker Worker Lost Threshold in minutes&nbsp;
              <Tooltip title="After how many minutes a Docker worker is deemed to be lost if it failed to communicate it's status.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('worker_lost_threshold_docker_minutes', { initialValue: this.state.config.worker_lost_threshold_docker_minutes })(<InputNumber min={6} max={1000} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Whether to chose a random region while spawning workers&nbsp;
              <Tooltip title="If this is set to true, a random region is chosen for lambda functions.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('random_region', { initialValue: this.state.config.random_region, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Worker Loglevel&nbsp;
              <Tooltip title="The log level of crawlers. Debug logs the most, error logs the least.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('worker_loglevel', { initialValue: this.state.config.worker_loglevel})(
              <Select placeholder="Please select the worker loglevel">
                <Option value="debug">debug</Option>
                <Option value="verbose">verbose</Option>
                <Option value="info">info</Option>
                <Option value="warn">warn</Option>
                <Option value="error">error</Option>
              </Select>
            )}
          </Form.Item>

          <Form.Item label={
            <span>
              Scheduler Loglevel&nbsp;
              <Tooltip title="The log level of the scheduler. Debug logs the most, error logs the least.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('scheduler_loglevel', { initialValue: this.state.config.scheduler_loglevel})(
              <Select placeholder="Please select the scheduler loglevel">
                <Option value="debug">debug</Option>
                <Option value="verbose">verbose</Option>
                <Option value="info">info</Option>
                <Option value="warn">warn</Option>
                <Option value="error">error</Option>
              </Select>
            )}
          </Form.Item>

          <Form.Item label={
            <span>
              Num Machines Browser&nbsp;
              <Tooltip title="How many browser crawling machines to allocate by default, if a task requires machines.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('num_machines_browser', { initialValue: this.state.config.num_machines_browser })(<InputNumber min={0} max={10} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Num Machines Http&nbsp;
              <Tooltip title="How many http crawling machines to allocate by default, if a task requires machines.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('num_machines_http', { initialValue: this.state.config.num_machines_http })(<InputNumber min={0} max={10} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Cluster Size&nbsp;
              <Tooltip title="The machine size of allocated worker machines.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('cluster_size', { initialValue: this.state.config.cluster_size})(
              <Select placeholder="Please select the cluster size">
                <Option value="small">small</Option>
                <Option value="medium">medium</Option>
                <Option value="larger">larger (t2.large, 2vCPU, 8G RAM)</Option>
                <Option value="large">large (t2.xlarge, 4vCPU, 16G RAM)</Option>
                <Option value="huge">huge (t2.2xlarge, 8vCPU, 32G RAM)</Option>
              </Select>
            )}
          </Form.Item>

          <Form.Item label={
            <span>
              Retry failed items&nbsp;
              <Tooltip title="How many times failed items should be retried by the crawling infra before they are considered to be definitely failed.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('retry_failed_items', { initialValue: this.state.config.retry_failed_items })(<InputNumber min={0} max={10} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Max Lost Workers Ratio&nbsp;
              <Tooltip title="lost_workers / total_workers, if this ratio is larger than max_lost_workers, the tasked is deemed to be failed and thus stopped">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('max_lost_workers_ratio', { initialValue: this.state.config.max_lost_workers_ratio })(<InputNumber min={0.0001} max={0.1} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Forcefully remove all machines&nbsp;
              <Tooltip title="If this is set to true, all crawling machines will be destroyed, without waiting for the tasks to finish.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('force_remove_machines', { initialValue: this.state.config.force_remove_machines, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              Update Config
            </Button>
          </Form.Item>
        </Form>
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Config</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <Title level={3}>Crawling Infra Config</Title>
          <p>
            Update the crawling infra configuration by editing the form fields below.
            Not all configuration fields should be updated by the end user.
          </p>
          <Popconfirm
            title="Do you really want to reset the configuration?"
            onConfirm={this.resetConfig.bind(this)}
            onCancel={this.cancel.bind(this)}
            okText="Yes"
            cancelText="No"
          >
            <Button type="danger" style={{ marginLeft: 8 }}>
              Reset Config to Default
            </Button>
          </Popconfirm>
          <Row style={{ marginTop: 30 }} gutter={[16, 32]}>
            <Col span={10}>
              {config}
            </Col>
          </Row>
        </div>
      </Content>
    );
  }
}