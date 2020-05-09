import React from 'react';
import "antd/dist/antd.css";
import "../index.css";
import {api} from "../common/api";
import {
  Form,
  Input,
  Tooltip,
  Icon,
  Select,
  Row,
  Col,
  Button,
  Switch,
  InputNumber,
  Typography, Spin, Breadcrumb, Layout, message
} from 'antd';

const { Title } = Typography;
const { Content } = Layout;
const { Option } = Select;

export class TaskEdit extends React.Component<{form: any}, {task: any}> {
  constructor(props: any) {
    super(props);
    this.state = {
      task: null,
    };
  }

  load() {
    this.setState({task: null});
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;
    api('task/' + task_id).then((data) => {
      this.setState({task: data});
    }).catch((err) => {
      console.error(err);
    });
  }

  componentDidMount(): void {
    this.load();
  }

  handleSubmit = (e: any) => {
    let task_id = this.state.task._id;
    e.preventDefault();
    this.props.form.validateFieldsAndScroll((err: any, values: any) => {
      if (!err) {
        this.setState({task: null});
        api('task/' + task_id, 'PUT', values).then((data) => {
          message.success('Successfully updated crawl task.');
          this.setState({task: data});
        }).catch((err) => {
          message.error('Failed to update crawl task: ' + err.toString());
        });
      }
    });
  };

  render() {
    let task_edit;
    // @ts-ignore
    let task_id = (this.props.match.params as any).id;

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

    if (this.state.task === null) {
      task_edit = (
        <div className="centered">
          <Spin tip="Loading..." size="large" />
        </div>
      )
    } else {
      task_edit = (
        <Form {...formItemLayout} onSubmit={this.handleSubmit} layout="vertical">

          <Form.Item label={
            <span>
              Task Status&nbsp;
              <Tooltip title="The task status. Only change this if you are aware of the implications.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('status', { initialValue: this.state.task.status})(
              <Select placeholder="Please select the task status">
                <Option value="started">started</Option>
                <Option value="completed">completed</Option>
                <Option value="failed">failed</Option>
                <Option value="paused">paused</Option>
              </Select>
            )}
          </Form.Item>

          <Form.Item label={
            <span>
              Crawling Speed&nbsp;
              <Tooltip title="The crawling infra attempts to reach this crawling speed">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('max_items_per_second', { initialValue: this.state.task.max_items_per_second })(<InputNumber min={0} max={100} />)}
            <span className="ant-form-text"> maximum items per second overall throughput</span>
          </Form.Item>

          <Form.Item label={
            <span>
              Number of running Workers&nbsp;
              <Tooltip title="Only change the number of running workers when you know what you are doing">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('num_workers_running', { initialValue: this.state.task.num_workers_running })(<InputNumber min={0} max={100} />)}
            <span className="ant-form-text"> workers currently running</span>
          </Form.Item>

          <Form.Item label={
            <span>
              Max Items per Worker&nbsp;
              <Tooltip title="The maximal number of items a single worker can handle">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('max_items_per_worker', { initialValue: this.state.task.max_items_per_worker })(<InputNumber min={1} max={5000} />)}
            <span className="ant-form-text"> maximum items per single worker</span>
          </Form.Item>

          <Form.Item label={
            <span>
              Max workers&nbsp;
              <Tooltip title="The upper limit of concurrent executing workers per task">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('max_workers', { initialValue: this.state.task.max_workers })(<InputNumber min={1} max={500} />)}
            <span className="ant-form-text"> maximal workers</span>
          </Form.Item>

          <Form.Item label="Task is using whitelisted proxies (No AWS crawling)">
            {getFieldDecorator('whitelisted_proxies', { initialValue: this.state.task.whitelisted_proxies, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Crawl Function&nbsp;
              <Tooltip title="The crawling function as javascript class">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('function_code', { initialValue: this.state.task.function_code })(<Input.TextArea rows={11} />)}
          </Form.Item>

          <Title level={4}>Crawl Options</Title>

          <Form.Item label={
            <span>
              Puppeteer Headful&nbsp;
              <Tooltip title="Run chromium/pptr in headless=false with XVFB display framebuffer. This way, many sites won't recognize the crawler.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.headful', { initialValue: true, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Default Browser Navigation Timeout (ms)&nbsp;
              <Tooltip title="The timeout for all browser/page navigation functions">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.default_navigation_timeout', { initialValue: this.state.task.crawl_options.default_navigation_timeout })(<InputNumber min={1000} max={100000} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Http Request Timeout (ms)&nbsp;
              <Tooltip title="The upper limit of http request timeout in ms">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.request_timeout', { initialValue: this.state.task.crawl_options.request_timeout })(<InputNumber min={100} max={100000} />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Block WebRTC requests&nbsp;
              <Tooltip title="Task blocks all webrtc requests. Useful to prevent IP leak.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.block_webrtc', { initialValue: this.state.task.crawl_options.block_webrtc, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Use random user agents&nbsp;
              <Tooltip title="Whether to use random user agents while crawling.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.random_user_agent', { initialValue: this.state.task.crawl_options.random_user_agent, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Use a random user data dir&nbsp;
              <Tooltip title="Whether to create a random user data dir before starting the browser. Browser will be not able to reuse cookies/session data.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.random_user_data_dir', { initialValue: this.state.task.crawl_options.random_user_data_dir, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item label={
            <span>
              Apply stealth evasion&nbsp;
              <Tooltip title="Whether to apply stealth evasion techniques on the browser.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
          }>
            {getFieldDecorator('crawl_options.apply_evasion', { initialValue: this.state.task.crawl_options.apply_evasion, valuePropName: 'checked' })(<Switch />)}
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit">
              Update task
            </Button>
          </Form.Item>

        </Form>
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Edit</Breadcrumb.Item>
          <Breadcrumb.Item>{task_id}</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <Title level={3}>Update Task</Title>
          <p>Update the task by changing the configuration below</p>

          <Row style={{ marginTop: 30 }} gutter={[16, 32]}>
            <Col span={10}>
              {task_edit}
            </Col>
          </Row>
        </div>
      </Content>
    );
  }
}