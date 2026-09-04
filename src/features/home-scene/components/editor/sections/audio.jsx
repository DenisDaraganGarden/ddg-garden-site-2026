import React from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import {
  CheckboxControl,
  RangeControl,
  SectionHeading,
  SelectControl,
} from '../../HomeEditorControls';

const gainFormatter = (value) => `${Math.round(Number(value) * 100)}%`;
const secondsFormatter = (value) => Number(value).toFixed(1);
const coordinateFormatter = (value) => Number(value).toFixed(1);

const TRACK_IDS = ['tanker', 'water', 'shore', 'boat', 'birds', 'wind', 'thunder', 'ui'];
const EMITTER_IDS = ['shore', 'birds', 'wind', 'thunder'];

export const AudioMixerSection = ({ settings, handleSettingChange, audioLab }) => {
  const { t } = useLanguage();
  const audio = settings.audio;

  return (
    <>
      <div className="home-editor-audio-transport" data-testid="home-editor-audio-transport">
        <div>
          <strong>{t('homeEditor.audio.labTitle')}</strong>
          <span>
            {audioLab?.state?.loading
              ? t('homeEditor.audio.loading')
              : t(`homeEditor.audio.context.${audioLab?.state?.contextState ?? 'idle'}`)}
          </span>
        </div>
        <button
          type="button"
          className={`home-editor-audio-preview ${audioLab?.previewEnabled ? 'active' : ''}`}
          onClick={() => audioLab?.setPreviewEnabled?.(!audioLab.previewEnabled)}
          data-testid="home-editor-audio-preview"
          data-previewing={audioLab?.previewEnabled ? 'true' : 'false'}
        >
          {audioLab?.previewEnabled
            ? t('homeEditor.audio.stopPreview')
            : t('homeEditor.audio.startPreview')}
        </button>
      </div>

      {audioLab?.state?.error ? (
        <p className="home-editor-audio-error" role="status">{audioLab.state.error}</p>
      ) : null}

      <CheckboxControl
        label={t('homeEditor.controls.audioEnabled')}
        checked={audio.enabled}
        onChange={(event) => handleSettingChange(event, 'audio.enabled', 'boolean')}
      />
      <SelectControl
        label={t('homeEditor.controls.audioMode')}
        value={audio.mode}
        onChange={(event) => handleSettingChange(event, 'audio.mode', 'string')}
        options={['off', 'music', 'soundscape', 'hybrid'].map((value) => ({
          value,
          label: t(`homeEditor.audio.modes.${value}`),
        }))}
      />

      <SectionHeading label={t('homeEditor.blocks.volume')} subtle />
      {[
        ['masterGain', 0, 1],
        ['musicGain', 0, 1],
        ['ambienceGain', 0, 1],
        ['spatialGain', 0, 1],
        ['weatherGain', 0, 1],
        ['uiGain', 0, 1],
      ].map(([key, min, max]) => (
        <RangeControl
          key={key}
          label={t(`homeEditor.controls.audio${key[0].toUpperCase()}${key.slice(1)}`)}
          value={audio[key]}
          min={min}
          max={max}
          step={0.01}
          formatValue={gainFormatter}
          onChange={(event) => handleSettingChange(event, `audio.${key}`)}
        />
      ))}

      <SectionHeading label={t('homeEditor.audio.routeTransitions')} subtle />
      <RangeControl
        label={t('homeEditor.controls.audioHomeFadeSeconds')}
        value={audio.homeFadeSeconds}
        min={0}
        max={8}
        step={0.1}
        unit=" s"
        formatValue={secondsFormatter}
        onChange={(event) => handleSettingChange(event, 'audio.homeFadeSeconds')}
      />
      <RangeControl
        label={t('homeEditor.controls.audioRouteFadeSeconds')}
        value={audio.routeFadeSeconds}
        min={0}
        max={8}
        step={0.1}
        unit=" s"
        formatValue={secondsFormatter}
        onChange={(event) => handleSettingChange(event, 'audio.routeFadeSeconds')}
      />

      <SectionHeading label={t('homeEditor.audio.cameraTransitions')} subtle />
      <CheckboxControl
        label={t('homeEditor.controls.audioSpatialEnabled')}
        checked={audio.spatialEnabled}
        onChange={(event) => handleSettingChange(event, 'audio.spatialEnabled', 'boolean')}
      />
      <CheckboxControl
        label={t('homeEditor.controls.audioDuckOnCameraCut')}
        checked={audio.duckOnCameraCut}
        onChange={(event) => handleSettingChange(event, 'audio.duckOnCameraCut', 'boolean')}
      />
      <RangeControl
        label={t('homeEditor.controls.audioCameraCutDuck')}
        value={audio.cameraCutDuck}
        min={0.25}
        max={1}
        step={0.01}
        formatValue={gainFormatter}
        onChange={(event) => handleSettingChange(event, 'audio.cameraCutDuck')}
      />
    </>
  );
};

const AudioTrackRow = ({ id, audio, handleSettingChange, audioLab, label, t }) => {
  const track = audio.tracks[id];
  const isSolo = audioLab?.state?.soloTrackId === id;

  return (
    <div className="home-editor-audio-track" data-testid={`home-editor-audio-track-${id}`}>
      <div className="home-editor-audio-track__identity">
        <span className={`home-editor-audio-track__lamp ${track.enabled ? 'active' : ''}`} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <input
        type="checkbox"
        aria-label={t('homeEditor.audio.trackEnabled', { track: label })}
        checked={track.enabled}
        onChange={(event) => handleSettingChange(event, `audio.tracks.${id}.enabled`, 'boolean')}
      />
      <button
        type="button"
        className={isSolo ? 'active' : ''}
        onClick={() => audioLab?.setSoloTrack?.(isSolo ? null : id)}
        title={t('homeEditor.audio.solo')}
        aria-pressed={isSolo}
      >
        S
      </button>
      <button
        type="button"
        onClick={() => audioLab?.previewTrack?.(id)}
        title={t('homeEditor.audio.preview')}
        data-testid={`home-editor-audio-preview-${id}`}
      >
        ▶
      </button>
      <input
        type="range"
        aria-label={`${label}: gain`}
        min="0"
        max="1.5"
        step="0.01"
        value={track.gain}
        onChange={(event) => handleSettingChange(event, `audio.tracks.${id}.gain`)}
      />
      <output>{gainFormatter(track.gain)}</output>
    </div>
  );
};

export const AudioTracksSection = ({ settings, handleSettingChange, audioLab }) => {
  const { t } = useLanguage();
  const audio = settings.audio;

  return (
    <>
      <p className="home-editor-audio-note">{t('homeEditor.audio.tracksNote')}</p>
      <div className="home-editor-audio-track-list" data-testid="home-editor-audio-track-list">
        {TRACK_IDS.map((id) => (
          <AudioTrackRow
            key={id}
            id={id}
            audio={audio}
            handleSettingChange={handleSettingChange}
            audioLab={audioLab}
            label={t(`homeEditor.audio.tracks.${id}`)}
            t={t}
          />
        ))}
      </div>
      <div className="home-editor-audio-music-preview">
        <span>{t('homeEditor.audio.tracks.music')}</span>
        <button
          type="button"
          onClick={() => audioLab?.previewTrack?.('music')}
          data-testid="home-editor-audio-preview-music"
        >
          ▶ {t('homeEditor.audio.listen')}
        </button>
      </div>
    </>
  );
};

const EmitterControls = ({ id, emitter, handleSettingChange, t }) => (
  <div className="home-editor-audio-emitter" data-testid={`home-editor-audio-emitter-${id}`}>
    <div className="home-editor-audio-emitter__heading">
      <strong>{t(`homeEditor.audio.emitters.${id}`)}</strong>
      <span>{t('homeEditor.audio.virtualEmitter')}</span>
    </div>
    <div className="home-editor-audio-emitter__controls">
      {['x', 'y', 'z'].map((axis) => (
        <RangeControl
          key={axis}
          label={axis.toUpperCase()}
          value={emitter[axis]}
          min={axis === 'y' ? -20 : -80}
          max={axis === 'y' ? 80 : 80}
          step={0.1}
          unit=" m"
          formatValue={coordinateFormatter}
          onChange={(event) => handleSettingChange(event, `audio.emitters.${id}.${axis}`)}
        />
      ))}
      <RangeControl
        label={t('homeEditor.controls.audioRefDistance')}
        value={emitter.refDistance}
        min={0.25}
        max={80}
        step={0.25}
        unit=" m"
        formatValue={coordinateFormatter}
        onChange={(event) => handleSettingChange(event, `audio.emitters.${id}.refDistance`)}
      />
      <RangeControl
        label={t('homeEditor.controls.audioMaxDistance')}
        value={emitter.maxDistance}
        min={1}
        max={240}
        step={1}
        unit=" m"
        onChange={(event) => handleSettingChange(event, `audio.emitters.${id}.maxDistance`)}
      />
      <RangeControl
        label={t('homeEditor.controls.audioRolloff')}
        value={emitter.rolloff}
        min={0}
        max={4}
        step={0.05}
        formatValue={(value) => Number(value).toFixed(2)}
        onChange={(event) => handleSettingChange(event, `audio.emitters.${id}.rolloff`)}
      />
    </div>
  </div>
);

export const AudioSpatialSection = ({ settings, handleSettingChange, audioLab }) => {
  const { t } = useLanguage();

  return (
    <>
      <p className="home-editor-audio-note">{t('homeEditor.audio.spatialNote')}</p>
      <div className="home-editor-audio-spatial-list">
        {EMITTER_IDS.map((id) => (
          <EmitterControls
            key={id}
            id={id}
            emitter={settings.audio.emitters[id]}
            handleSettingChange={handleSettingChange}
            t={t}
          />
        ))}
        <div className="home-editor-audio-emitter home-editor-audio-emitter--bound">
          <div className="home-editor-audio-emitter__heading">
            <strong>{t('homeEditor.audio.emitters.boat')}</strong>
            <span>{t('homeEditor.audio.boundEmitter')}</span>
          </div>
          <p>{t('homeEditor.audio.boatBindingNote')}</p>
          <button type="button" onClick={() => audioLab?.previewTrack?.('boat')}>
            ▶ {t('homeEditor.audio.listen')}
          </button>
        </div>
      </div>
    </>
  );
};
