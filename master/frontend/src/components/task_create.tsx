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
  Spin,
  Button,
  Switch,
  InputNumber,
  Tabs,
  Typography, Breadcrumb, Layout, message
} from 'antd';

import {Redirect} from "react-router-dom";
import SyntaxHighlighter from "react-syntax-highlighter";
import {docco} from "react-syntax-highlighter/dist/esm/styles/hljs";
import TextArea from "antd/es/input/TextArea";

const { Title } = Typography;
const { Content } = Layout;
const { Option } = Select;
const { TabPane } = Tabs;

export class TaskCreate extends React.Component<{form: any}, {redirect: boolean, api_response: string | null, loading_response: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = {
      redirect: false,
      api_response: null,
      loading_response: false,
    }
  }

  handleSubmit = (e: any) => {
    e.preventDefault();
    this.props.form.validateFieldsAndScroll((err: any, values: any) => {
      if (!err) {
        api('task/', 'POST', values).then((data) => {
          console.log(data);
          message.success('Crawl Task created');
          this.setState({redirect: true});
        }).catch((err) => {
          console.log(err);
          message.error('Crawl Task creation failed: ' + JSON.stringify(err));
          this.setState({redirect: false});
        });
      }
    });
  };

  isValidUrl(url: string) {
    try {
      new URL(url);
      return true;
    } catch (err) {
      return false;
    }
  }

  validateFunction(rule: any, value: string, callback: any) {
    if (value.length) {
      if (this.isValidUrl(value) || value.endsWith('.js')) {
        callback();
      } else {
        callback('not a valid url!');
      }
    } else {
      callback();
    }
  }

  validateItems(rule: any, value: any, callback: any) {
    if (this.isValidUrl(value)) {
      callback();
    } else {
      callback('not a valid url!');
    }
  }

  switchTabs = () => {

  };

  makeApiRequest = () => {
    let payload = null;
    let node = document.getElementById('create_api_payload');
    if (node) {
      // @ts-ignore
      payload = JSON.parse(node.value);
    }

    if (!payload) {
      message.error('Invalid Payload: ' + payload);
      return;
    }

    this.setState({
      api_response: null,
      loading_response: true
    });

    api('crawl/', 'POST', payload).then((data) => {
      message.success('Api request made');
      let response = JSON.stringify(data, null, 1);
      //console.log(response);
      this.setState({api_response: response});
    }).catch((err) => {
      console.log(err);
      message.error('Api request failed: ' + JSON.stringify(err));
      this.setState({api_response: JSON.stringify(err, null, 1)});
    }).finally(() => {
      this.setState({loading_response: false});
    });
  };

  render() {
    let task_create;
    const { getFieldDecorator } = this.props.form;

    const { redirect } = this.state;

    if (redirect) {
      return <Redirect to='/'/>;
    }

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

    let sample_task = `class Get extends HttpWorker {
  async crawl(url) {
    let result = await this.Got(encodeURI(url));
    return result.body;
  }
}`;

    let example_task_browser = `class Render extends BrowserWorker {
  async crawl(url) {
    await this.page.goto(url, {
      waitUntil: 'networkidle2', // two open connections is okay
    });

    return await this.page.content();
  }
}`;

    let api_payload: string = `{
  "function": "https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/ip.js",
  "items": ["dummy", "dummy", "dummy", "dummy", "dummy"],
  "concurrency": 5,
  "metadata": true
}`;

    let api_response_html;

    if (this.state.loading_response) {
      api_response_html = (
        <div className="centered">
          <Spin tip="Loading Tasks..." size="large" />
        </div>
      )
    }

    if (this.state.api_response) {
      api_response_html = (
        <TextArea id="api_response" rows={15} style={{marginBottom: 10}} value={this.state.api_response}>
        </TextArea>
      )
    }

    task_create = (
      <Form {...formItemLayout} onSubmit={this.handleSubmit} layout="vertical">

        <Tabs defaultActiveKey="1" onChange={this.switchTabs} type="card" style={{marginBottom: 30}}>
          <TabPane tab="Crawl Task Url" key="2">
            <p>Please submit a Url that points to the Crawl Task.</p>
            <Form.Item label={
              <span>
            Crawl Task Url&nbsp;
                <Tooltip title="An url pointing to the crawling function">
            <Icon type="question-circle-o" />
            </Tooltip>
          </span>
            } hasFeedback>
              {getFieldDecorator('function', {
                initialValue: 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/google_scraper.js',
                rules: [
                  {
                    required: false,
                    message: 'Please input your function url!',
                  },
                  {
                    validator: this.validateFunction.bind(this),
                  },
                ],
              })(<Input />)}
            </Form.Item>
          </TabPane>
          <TabPane tab="Crawl Task Code" key="1">
            <p>Please submit the Crawl Task as a Javascript Class.</p>
            <Form.Item label={
              <span>
              Crawl Task Code&nbsp;
                <Tooltip title="The crawling function as javascript class">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
            }>
              {getFieldDecorator('function_code', { initialValue: '' })(
                <Input.TextArea rows={11} placeholder={sample_task} />
              )}
            </Form.Item>
          </TabPane>
        </Tabs>

        <Form.Item label={
          <span>
              Region&nbsp;
            <Tooltip title="The crawling region. There are several regions available such as us, de, uk. If left blank, the crawling region is chosen randomly">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
        }>
          {getFieldDecorator('region', { initialValue: 'us'})(
            <Input placeholder="us" />
          )}
        </Form.Item>

        <Form.Item label={
          <span>
              Task Status&nbsp;
            <Tooltip title="The task status. When set to paused, the infra will not start making progress on it.">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
        }>
          {getFieldDecorator('status', { initialValue: 'started'})(
            <Select placeholder="Please select the task status">
              <Option value="started">started</Option>
              <Option value="paused">paused</Option>
            </Select>
          )}
        </Form.Item>

        <Form.Item label={
          <span>
            Items&nbsp;
            <Tooltip title="An url pointing to the items file. Document may be gzipped.">
            <Icon type="question-circle-o" />
            </Tooltip>
          </span>
        } hasFeedback>
          {getFieldDecorator('items', {
            initialValue: 'https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/items/top100.txt',
            rules: [
              {
                required: true,
                message: 'Please input your the items url!',
              },
              {
                validator: this.validateItems.bind(this),
              },
            ],
          })(<Input placeholder="https://raw.githubusercontent.com/NikolaiT/scrapeulous/master/items/top100.txt" />)}
        </Form.Item>

        <Form.Item label={
          <span>
            Crawling Speed&nbsp;
            <Tooltip title="The crawling infra attempts to reach this crawling speed">
            <Icon type="question-circle-o" />
            </Tooltip>
          </span>
        }>
          {getFieldDecorator('max_items_per_second', { initialValue: 1 })(<InputNumber min={0} max={100} />)}
          <span className="ant-form-text"> maximum items per second throughput</span>
        </Form.Item>

        <Form.Item label={
          <span>
            Use whitelisted proxies&nbsp;
            <Tooltip title="Task must use whitelisted proxies. This will allocate docker crawling machines on AWS EC2 if no machines are already allocated. AWS Lambda crawling is not possible, because we cannot whitelist proxies there.">
            <Icon type="question-circle-o" />
            </Tooltip>
          </span>
        }>
          {getFieldDecorator('whitelisted_proxies', { initialValue: false, valuePropName: 'checked' })(<Switch />)}
        </Form.Item>

        <Form.Item label={
          <span>
              Crawling Profile&nbsp;
            <Tooltip title="The crawling profile for this task. cloudflare - maximum stealth, random user agent, uses proxies,
            block WebRTC, random user data dir, ...">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
        }>
          {getFieldDecorator('profile', {})(
            <Select placeholder="Please select the crawling profile">
              <Option value="cloudflare">cloudflare</Option>
              <Option value="curl">curl</Option>
              <Option value="mobile_proxy">mobile_proxy</Option>
            </Select>
          )}
        </Form.Item>

        <Form.Item label={
          <span>
              Task Priority&nbsp;
            <Tooltip title="The task priority between 1 (lowest) and 10 (highest)">
              <Icon type="question-circle-o" />
              </Tooltip>
            </span>
        }>
          {getFieldDecorator('priority', { initialValue: 1 })(<InputNumber min={1} max={10} />)}
        </Form.Item>

        <Form.Item>
          <Button type="primary" htmlType="submit">
            Create Crawl Task
          </Button>
        </Form.Item>

      </Form>
    );

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Task</Breadcrumb.Item>
          <Breadcrumb.Item>Create</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>

          <Title level={3}>Test direct Api</Title>
          <p>Test the internal Api by making direct requests.</p>

          {getFieldDecorator('api_payload', { initialValue: api_payload })(<Input.TextArea rows={7} placeholder="" style={{marginBottom: 10}} />)}

          {api_response_html}

          <Button type="primary" onClick={this.makeApiRequest.bind(this)} style={{marginBottom: 10}}>
            Make Api Request
          </Button>

          <Title level={3}>Create a Crawl Task</Title>
          <p>Create the crawl task by specifying the fields below. An example task could look like</p>

          <SyntaxHighlighter language="javascript" style={docco}>
            {example_task_browser}
          </SyntaxHighlighter>

          <Row style={{ marginTop: 30 }} gutter={[16, 32]}>
            <Col span={14}>
              {task_create}
            </Col>
          </Row>
        </div>
      </Content>
    );
  }
}