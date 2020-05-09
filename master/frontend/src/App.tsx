import React from 'react';
import "antd/dist/antd.css";
import "./index.css";
import { Layout, Menu, Form } from "antd";
import {
  BrowserRouter as Router,
  Switch,
  Route,
  Link
} from "react-router-dom";
import {Tasks} from './components/tasks';
import {Proxies} from './components/proxies';
import {Machines} from './components/machines';
import {TaskDetails} from './components/task_detail';
import {TaskEdit} from './components/task_edit';
import {Items} from './components/items';
import {TaskCreate} from './components/task_create';
import {Config} from './components/config';
import {Logs} from './components/logs';
import {Workers} from './components/workers';

const { Header, Footer } = Layout;

class App extends React.Component<{}, { tasks: any, task_details: any, selectedRowKeys: any, loading: boolean }> {
  constructor(props: any) {
    super(props);
  }

  render() {

    const EditForm = Form.create({ name: 'edit' })(TaskEdit);
    const CreateForm = Form.create({ name: 'create' })(TaskCreate);
    const ConfigForm = Form.create({ name: 'config' })(Config);

    return (
      <Router>
        <Layout className="layout">
          <Header>
            <div className="logo" />
            <Menu
              theme="dark"
              mode="horizontal"
              defaultSelectedKeys={['1']}
              style={{ lineHeight: '64px' }}
            >
              <Menu.Item key="1">
                <Link to="/">Tasks</Link>
              </Menu.Item>
              <Menu.Item key="2">
                <Link to="/create">Create Task</Link>
              </Menu.Item>
              <Menu.Item key="3">
                <Link to="/proxies">Proxies</Link>
              </Menu.Item>
              <Menu.Item key="4">
                <Link to="/machines">Machines</Link>
              </Menu.Item>
              <Menu.Item key="5">
                <Link to="/config">Config</Link>
              </Menu.Item>
              {/*<Menu.Item key="6">*/}
                {/*<Link to="/logs">Logs</Link>*/}
              {/*</Menu.Item>*/}
            </Menu>
          </Header>

          {/* A <Switch> looks through its children <Route>s and
            renders the first one that matches the current URL. */}
          <Switch>
            <Route path="/machines">
              <Machines />
            </Route>
            <Route path="/proxies">
              <Proxies />
            </Route>
            <Route path="/logs">
              <Logs />
            </Route>
            <Route path="/config" component={ConfigForm}>
            </Route>
            <Route path="/create" component={CreateForm}>
            </Route>
            <Route path="/edit/:id" component={EditForm}>
            </Route>
            <Route path="/details/:id" component={TaskDetails}>
            </Route>
            <Route path="/items/:id" component={Items}>
            </Route>
            <Route path="/workers/:id" component={Workers}>
            </Route>
            <Route path="/">
              <Tasks />
            </Route>
          </Switch>

          <Footer style={{ textAlign: 'center' }}>Crawling Infrastructure ©2020</Footer>
        </Layout>
      </Router>
    );
  }
}



export default App;
