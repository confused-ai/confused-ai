/**
 * Artifacts: typed outputs, versioning, and media helpers
 */

// Core artifacts
export {
    InMemoryArtifactStorage,
    createTextArtifact,
    createMarkdownArtifact,
    createDataArtifact,
    createReasoningArtifact,
    createPlanArtifact,
} from './artifact.js';

export type {
    ArtifactType,
    ArtifactMetadata,
    Artifact,
    TextArtifact,
    DataArtifact,
    BinaryArtifact,
    ReasoningArtifact,
    PlanArtifact,
    ReportArtifact,
    ArtifactStorage,
    ArtifactStorageConfig,
} from './artifact.js';

// Media artifacts
export {
    MediaManager,
    createImageFromUrl,
    createImageFromBase64,
    createAudioFromUrl,
    createVideoFromUrl,
} from './media.js';

export type {
    ImageArtifact,
    AudioArtifact,
    VideoArtifact,
} from './media.js';
