import React from "react";
import {api} from "../common/api";
import {Layout, Breadcrumb, Spin, message, Typography} from "antd";
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';
const { Content } = Layout;
const { Title } = Typography;

export class Logs extends React.Component<{}, {logdata: any, loading: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = {
      logdata: null,
      loading: false,
    }
  }

  load() {
    api('scheduler/logs', 'GET').then((data) => {
      console.log(data);
      this.setState({
        logdata: data,
      });
    }).catch((err) => {
      message.error(err.toString());
    })
  }

  componentDidMount() {
    // this.load();
  }

  render() {
    let {logdata} = this.state;
    let loghtml;

    if (logdata === null) {
      loghtml = (
        <div className="centered">
          <Spin tip="Loading Logs..." size="large" />
        </div>
      );
    } else {
      loghtml = (
        <SyntaxHighlighter language="json" style={docco}>
          {this.state.logdata.logs}
        </SyntaxHighlighter>
      );
    }

    return (
      <Content style={{ padding: '0 50px' }}>
        <Breadcrumb style={{ margin: '16px 0' }}>
          <Breadcrumb.Item>Home</Breadcrumb.Item>
          <Breadcrumb.Item>Logs</Breadcrumb.Item>
        </Breadcrumb>
        <div style={{ background: '#fff', padding: 24, minHeight: 280 }}>
          <Title level={2}>Crawling Infra Logs</Title>
          <div className="items">{loghtml}</div>
        </div>
      </Content>
    )
  }
}