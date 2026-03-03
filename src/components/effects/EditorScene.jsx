import React from 'react';
import SnakeScene from './SnakeScene';

const EditorScene = ({
    settings,
    selectedId,
    setSelectedId,
    isDragging,
    setIsDragging,
    handleTransformUpdate,
}) => (
    <SnakeScene
        settings={settings}
        editable
        selectedId={selectedId}
        setSelectedId={setSelectedId}
        isDragging={isDragging}
        setIsDragging={setIsDragging}
        handleTransformUpdate={handleTransformUpdate}
    />
);

export default EditorScene;
