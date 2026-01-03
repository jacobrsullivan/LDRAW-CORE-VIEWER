import React, { useCallback, useEffect, useState, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useModel, useActions, useSelection, useHasUnsavedChanges, useCurrentFileName } from '../state/useModelStore';
import { serializeModel, PieceLineMapping } from '../ldraw/LDrawSerializer';
import { parseLDraw } from '../ldraw/LDrawParser';
import { SceneFileManager, FolderStructure } from '../utils/SceneFileManager';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { FileNameModal } from './modals/FileNameModal';

export const LDrawEditor: React.FC = () => {
  const model = useModel();
  const selection = useSelection();
  const actions = useActions();

  // Editor state hooks
  const hasUnsavedChanges = useHasUnsavedChanges();
  const currentFileName = useCurrentFileName();

  // Enhanced state for regenerative serialization
  const [immediateContent, setImmediateContent] = useState('');
  const [debouncedContent, setDebouncedContent] = useState('');
  const [isExternalUpdate, setIsExternalUpdate] = useState(false);

  // Monaco editor reference and selection highlighting
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const [pieceLineMapping, setPieceLineMapping] = useState<PieceLineMapping[]>([]);
  const decorationsRef = useRef<string[]>([]);

  // Scene file management state
  const [folderStructure, setFolderStructure] = useState<FolderStructure>({ type: 'folder', name: 'public', children: [] });
  const [selectedScene, setSelectedScene] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Modal state for improved UX
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onSave: () => void;
    onDontSave: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onSave: () => {},
    onDontSave: () => {}
  });

  // Helper function to render folder structure as flat optgroups
  const renderFolderOptions = (node: FolderStructure, parentPath: string = ''): React.ReactNode[] => {
    const options: React.ReactNode[] = [];

    if (!node.children) return options;

    // First, collect all files at this level
    const filesAtThisLevel: FolderStructure[] = [];
    const foldersAtThisLevel: FolderStructure[] = [];

    for (const child of node.children) {
      if (child.type === 'file') {
        filesAtThisLevel.push(child);
      } else if (child.type === 'folder') {
        foldersAtThisLevel.push(child);
      }
    }

    // Add files at root level (no optgroup)
    if (parentPath === '' && filesAtThisLevel.length > 0) {
      for (const file of filesAtThisLevel) {
        if (file.path) {
          options.push(
            <option key={file.path} value={file.path}>
              {file.name}
            </option>
          );
        }
      }
    }

    // Add folders as separate optgroups (flat, not nested)
    for (const folder of foldersAtThisLevel) {
      if (folder.children) {
        const folderLabel = parentPath ? `${parentPath}/${folder.name}` : folder.name;

        // Collect all files in this folder
        const filesInFolder = folder.children.filter(child => child.type === 'file');

        if (filesInFolder.length > 0) {
          options.push(
            <optgroup key={`${parentPath}/${folder.name}`} label={folderLabel}>
              {filesInFolder.map(file =>
                file.path ? (
                  <option key={file.path} value={file.path}>
                    {file.name}
                  </option>
                ) : null
              )}
            </optgroup>
          );
        }

        // Recursively handle subfolders as separate optgroups
        const subfolders = folder.children.filter(child => child.type === 'folder');
        for (const subfolder of subfolders) {
          if (subfolder.children) {
            const subOptions = renderFolderOptions(
              { type: 'folder', name: 'temp', children: [subfolder] },
              parentPath ? `${parentPath}/${folder.name}` : folder.name
            );
            options.push(...subOptions);
          }
        }
      }
    }

    return options;
  };

  const [fileNameModal, setFileNameModal] = useState<{
    isOpen: boolean;
    title: string;
    defaultValue: string;
    onConfirm: (fileName: string) => void;
  }>({
    isOpen: false,
    title: '',
    defaultValue: '',
    onConfirm: () => {}
  });

  // Regenerative serialization on external model changes (from 3D view)
  useEffect(() => {
    const serializationResult = serializeModel(model, true);
    const serialized = serializationResult.content;

    // Only update if content actually changed AND it's different from what's currently debounced
    if (serialized !== debouncedContent && !isExternalUpdate) {
      setIsExternalUpdate(true);
      // Update both immediate and debounced content to stay in sync
      setImmediateContent(serialized);
      setDebouncedContent(serialized);
      // Update piece line mapping
      setPieceLineMapping(serializationResult.pieceLineMapping);

      // If there's a filename, mark as unsaved since model changed
      if (currentFileName) {
        actions.setHasUnsavedChanges(true);
        console.log('Model changed via 3D viewer, marking as unsaved');
      }

      // Reset flag after update to allow user input again
      setTimeout(() => {
        setIsExternalUpdate(false);
      }, 100);
    }
  }, [model, debouncedContent, currentFileName, isExternalUpdate, actions]);

  // Selection highlighting effect
  useEffect(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const monaco = (window as { monaco?: typeof Monaco }).monaco;

    if (!monaco) return;

    // Calculate which lines to highlight based on selection
    const linesToHighlight: number[] = [];
    for (const selectedId of selection) {
      const mapping = pieceLineMapping.find(m => m.pieceId === selectedId);
      if (mapping) {
        linesToHighlight.push(mapping.lineNumber);
      }
    }

    // Create decorations for highlighted lines
    const newDecorations = linesToHighlight.map(lineNumber => ({
      range: new monaco.Range(lineNumber, 1, lineNumber, 1),
      options: {
        isWholeLine: true,
        className: 'selected-piece-line',
        marginClassName: 'selected-piece-margin'
      }
    }));

    // Apply decorations and store reference
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);

    console.log(`Updated editor highlighting for ${linesToHighlight.length} selected pieces`);
  }, [selection, pieceLineMapping]);

  // Auto-load default scene when component mounts and no model exists
  useEffect(() => {
    if (!model || model.pieces.length === 0) {
      console.log('Loading default.ldr from scenes folder');

      SceneFileManager.loadDefaultScene()
        .then(({ content, model: loadedModel }) => {
          setImmediateContent(content);
          setDebouncedContent(content);
          actions.setCurrentFileName('default.ldr');
          setSelectedScene('scenes/default.ldr');
          setParseError(null);
          actions.setHasUnsavedChanges(false);

          // Load the model into the store
          actions.loadModel(content, true);

          console.log('Default scene loaded', {
            pieceCount: loadedModel.pieces.length,
            hasName: !!loadedModel.name
          });
        })
        .catch(error => {
          console.error('Error loading default scene:', error);
          setParseError(`Failed to load default scene: ${error.message}`);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Fetch folder structure
  const refreshScenesList = useCallback(() => {
    console.log('Fetching folder structure');

    SceneFileManager.getFolderStructure()
      .then(structure => {
        setFolderStructure(structure);
        console.log('Folder structure loaded', {
          hasStructure: !!structure.children
        });
      })
      .catch(error => {
        console.error('Error fetching folder structure:', error);
      });
  }, []);

  // Fetch available scenes on component mount
  useEffect(() => {
    refreshScenesList();
  }, [refreshScenesList]);

  // Model-aware dropdown sync
  useEffect(() => {
    // Only run if we have a model but selectedScene is empty
    if (model && model.pieces.length > 0 && !selectedScene) {
      console.log('Syncing dropdown with existing model');

      // Try to determine the current scene from currentFileName
      if (currentFileName) {
        if (currentFileName === 'default.ldr') {
          setSelectedScene('scenes/default.ldr');
          console.log('Synced dropdown to default.ldr');
        } else {
          // Look for the file in the folder structure
          const findScenePath = (structure: FolderStructure): string | null => {
            if (structure.type === 'file' && structure.name === currentFileName) {
              return structure.path || '';
            }
            if (structure.children) {
              for (const child of structure.children) {
                const found = findScenePath(child);
                if (found) return found;
              }
            }
            return null;
          };

          const scenePath = findScenePath(folderStructure);
          if (scenePath) {
            setSelectedScene(scenePath);
            console.log('Synced dropdown to:', scenePath);
          }
        }
      }
    }
  }, [model, selectedScene, currentFileName, folderStructure]);

  // Debounced model updates
  useEffect(() => {
    // Skip if this is an external update to prevent loops
    if (isExternalUpdate) {
      return;
    }

    // Skip if immediate content is empty or same as debounced content
    if (!immediateContent || immediateContent === debouncedContent) {
      return;
    }

    const handler = setTimeout(() => {
      try {
        console.log('Parsing debounced editor content for model update');
        const parsedModel = parseLDraw(immediateContent);

        // Update debounced content to match what we're processing
        setDebouncedContent(immediateContent);

        // Clear any previous parse errors
        setParseError(null);

        // Load the new model into the store
        actions.loadModel(immediateContent);

        console.log('Model updated from debounced editor content', {
          pieceCount: parsedModel.pieces.length,
          hasName: !!parsedModel.name
        });
      } catch (error) {
        console.warn('Editor parse error:', error);
        setParseError(error instanceof Error ? error.message : String(error));
      }
    }, 2000); // 2-second delay for model updates

    return () => {
      clearTimeout(handler);
    };
  }, [immediateContent, debouncedContent, actions, isExternalUpdate]);

  // Helper to show unsaved changes confirmation
  const showUnsavedChangesModal = useCallback((title: string, message: string, onSave: () => void, onDontSave: () => void, onCancel?: () => void) => {
    setConfirmationModal({
      isOpen: true,
      title,
      message,
      onSave: async () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        // Only save if we have content and filename
        if (immediateContent && currentFileName) {
          try {
            await SceneFileManager.saveScene(currentFileName, immediateContent);
            const normalizedPath = currentFileName.includes('/') ? currentFileName : `scenes/${currentFileName}`;
            actions.setHasUnsavedChanges(false);
            refreshScenesList();
            setSelectedScene(normalizedPath);
            console.log('File saved before action:', currentFileName);
          } catch (error) {
            console.error('Save error:', error);
            alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
            return;
          }
        }
        onSave();
      },
      onDontSave: () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        onDontSave();
      },
      onCancel: () => {
        setConfirmationModal(prev => ({ ...prev, isOpen: false }));
        onCancel?.();
      }
    });
  }, [immediateContent, currentFileName, refreshScenesList, actions]);

  // Enhanced scene selection handler with modal
  const handleSceneSelect = useCallback((sceneFileName: string) => {
    if (!sceneFileName) return;

    const loadScene = () => {
      console.log(`Loading scene: ${sceneFileName}`);
      setSelectedScene(sceneFileName);

      SceneFileManager.loadScene(sceneFileName)
        .then(({ content, model: loadedModel }) => {
          setImmediateContent(content);
          setDebouncedContent(content);
          actions.setCurrentFileName(sceneFileName.split('/').pop() || sceneFileName);
          setParseError(null);
          actions.setHasUnsavedChanges(false);

          // Load the model into the store
          actions.loadModel(content, true);

          console.log('Scene loaded', {
            filename: sceneFileName,
            pieceCount: loadedModel.pieces.length
          });
        })
        .catch(error => {
          console.error(`Error loading scene ${sceneFileName}:`, error);
          setParseError(`Failed to load scene: ${error.message}`);
        });
    };

    if (hasUnsavedChanges) {
      showUnsavedChangesModal(
        'Unsaved Changes',
        'You have unsaved changes. Would you like to save before loading a different file?',
        loadScene,
        loadScene
      );
    } else {
      loadScene();
    }
  }, [actions, hasUnsavedChanges, showUnsavedChangesModal]);

  // Simplified editor change handler
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value || isExternalUpdate) {
      return;
    }

    // Update immediate content state for instant visual feedback
    setImmediateContent(value);
    actions.setHasUnsavedChanges(true);
  }, [isExternalUpdate, actions]);

  // Save As functionality
  const handleSaveAs = useCallback(() => {
    if (!immediateContent) return;

    setFileNameModal({
      isOpen: true,
      title: 'Save As',
      defaultValue: currentFileName || 'new_model.ldr',
      onConfirm: async (fileName: string) => {
        setFileNameModal(prev => ({ ...prev, isOpen: false }));

        // Add .ldr extension if not provided
        const finalFileName = (!fileName.toLowerCase().endsWith('.ldr') &&
                             !fileName.toLowerCase().endsWith('.dat'))
          ? `${fileName}.ldr`
          : fileName;

        setIsSaving(true);

        try {
          await SceneFileManager.saveScene(finalFileName, immediateContent);

          const normalizedPath = finalFileName.includes('/') ? finalFileName : `scenes/${finalFileName}`;

          actions.setCurrentFileName(finalFileName);
          actions.setHasUnsavedChanges(false);
          refreshScenesList();
          setSelectedScene(normalizedPath);
          console.log('File saved as:', finalFileName);
        } catch (error) {
          console.error('Save As error:', error);
          alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setIsSaving(false);
        }
      }
    });
  }, [immediateContent, currentFileName, refreshScenesList, actions]);

  // Save functionality
  const handleSave = useCallback(async () => {
    if (!immediateContent) return;

    const saveFileName = currentFileName;

    // If we don't have a filename, use Save As flow instead
    if (!saveFileName) {
      handleSaveAs();
      return;
    }

    setIsSaving(true);

    try {
      await SceneFileManager.saveScene(saveFileName, immediateContent);

      actions.setCurrentFileName(saveFileName);
      actions.setHasUnsavedChanges(false);
      refreshScenesList();

      const dropdownPath = saveFileName.includes('/') ? saveFileName : `scenes/${saveFileName}`;
      setSelectedScene(dropdownPath);

      console.log('File saved successfully:', saveFileName);
    } catch (error) {
      console.error('Save error:', error);
      alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [immediateContent, currentFileName, refreshScenesList, handleSaveAs, actions]);

  // Reload current file functionality
  const handleReloadCurrentFile = useCallback(() => {
    if (!currentFileName || !selectedScene) {
      console.log('No current file to reload');
      return;
    }

    console.log(`Reloading current file: ${currentFileName}`);

    SceneFileManager.loadScene(selectedScene)
      .then(({ content, model: loadedModel }) => {
        setImmediateContent(content);
        setDebouncedContent(content);
        setParseError(null);
        actions.setHasUnsavedChanges(false);

        // Load the model into the store
        actions.loadModel(content, true);

        console.log('File reloaded', {
          filename: currentFileName,
          pieceCount: loadedModel.pieces.length
        });
      })
      .catch(error => {
        console.error(`Error reloading file ${currentFileName}:`, error);
        setParseError(`Failed to reload file: ${error.message}`);
      });
  }, [currentFileName, selectedScene, actions]);

  return (
    <div className="editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>
      {/* Editor toolbar with scene management */}
      <div className="editor-toolbar" style={{
        padding: '8px',
        backgroundColor: '#f0f0f0',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '8px'
      }}>
        <select
          value={selectedScene}
          onChange={(e) => handleSceneSelect(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">Select a scene...</option>
          {renderFolderOptions(folderStructure)}
        </select>

        <button
          onClick={handleSave}
          disabled={isSaving || !immediateContent}
          style={{
            opacity: (isSaving || !immediateContent) ? 0.6 : 1,
            cursor: (isSaving || !immediateContent) ? 'not-allowed' : 'pointer'
          }}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>

        <button
          onClick={handleSaveAs}
          disabled={isSaving || !immediateContent}
          style={{
            opacity: (isSaving || !immediateContent) ? 0.6 : 1,
            cursor: (isSaving || !immediateContent) ? 'not-allowed' : 'pointer'
          }}
        >
          Save As
        </button>

        <button
          onClick={handleReloadCurrentFile}
          disabled={!currentFileName || !selectedScene}
          style={{
            opacity: (!currentFileName || !selectedScene) ? 0.6 : 1,
            cursor: (!currentFileName || !selectedScene) ? 'not-allowed' : 'pointer'
          }}
        >
          Reload
        </button>
      </div>

      {/* Current file name display */}
      {currentFileName && (
        <div style={{
          padding: '4px 8px',
          backgroundColor: '#e0e0e0',
          fontSize: '12px',
          borderBottom: '1px solid #ddd'
        }}>
          Current file: {currentFileName} {hasUnsavedChanges ? '*' : ''}
        </div>
      )}

      {/* Parse error display */}
      {parseError && (
        <div style={{
          padding: '8px',
          backgroundColor: '#ffeeee',
          color: '#cc0000',
          borderBottom: '1px solid #ffcccc'
        }}>
          Parse error: {parseError}
        </div>
      )}

      {/* Monaco editor with LDraw syntax highlighting */}
      <div style={{ flex: 1 }}>
        <MonacoEditor
          height="100%"
          defaultLanguage="ldraw"
          value={immediateContent}
          onChange={handleEditorChange}
          onMount={(editor) => {
            editorRef.current = editor;
            console.log('Monaco editor mounted for selection highlighting');
          }}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontSize: 14,
            renderLineHighlight: 'all',
            lineNumbers: 'on',
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            wordBasedSuggestions: "off",
            wordWrap: 'off',
            wordWrapColumn: 1000,
            stopRenderingLineAfter: -1,
            readOnly: false,
          }}
          beforeMount={(monaco) => {
            // Register LDraw language for syntax highlighting
            if (!monaco.languages.getLanguages().some(({ id }) => id === 'ldraw')) {
              monaco.languages.register({ id: 'ldraw' });
              monaco.languages.setMonarchTokensProvider('ldraw', {
                tokenizer: {
                  root: [
                    [/^0/, 'meta'],
                    [/^1/, 'keyword'],
                    [/^[2-5]/, 'number'],
                    [/\/\/.*$/, 'comment'],
                  ]
                }
              });

              monaco.editor.defineTheme('ldrawTheme', {
                base: 'vs',
                inherit: true,
                rules: [
                  { token: 'meta', foreground: '008800' },
                  { token: 'keyword', foreground: '0000ff' },
                  { token: 'number', foreground: '098658' },
                  { token: 'comment', foreground: '008000' }
                ],
                colors: {}
              });

              monaco.editor.setTheme('ldrawTheme');
            }
          }}
        />
      </div>

      {/* Modal components for improved UX */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        message={confirmationModal.message}
        onSave={confirmationModal.onSave}
        onDontSave={confirmationModal.onDontSave}
        onCancel={confirmationModal.onCancel || (() => setConfirmationModal(prev => ({ ...prev, isOpen: false })))}
      />

      <FileNameModal
        isOpen={fileNameModal.isOpen}
        title={fileNameModal.title}
        defaultValue={fileNameModal.defaultValue}
        placeholder="Enter filename (e.g., my_model.ldr)"
        onConfirm={fileNameModal.onConfirm}
        onCancel={() => setFileNameModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
