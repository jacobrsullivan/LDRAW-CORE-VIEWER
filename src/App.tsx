import { AppHeader } from './components/AppHeader';
import { ResizablePaneContainer } from './components/ResizablePaneContainer';
import { Canvas3D } from './components/Canvas3D';
import { LDrawEditor } from './components/LDrawEditor';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <AppHeader />
      <main className="app-content">
        <ResizablePaneContainer
          leftPane={<Canvas3D />}
          rightPane={<LDrawEditor />}
          initialSplitPercent={60}
          minLeftWidth={300}
          minRightWidth={250}
        />
      </main>
    </div>
  );
}

export default App;
