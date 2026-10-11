import { getRepository } from '@server/datasource';
import DiscoverSlider from '@server/entity/DiscoverSlider';
import { prepareCustomSliderData } from '@server/lib/discoverSliders';
import logger from '@server/logger';
import { Router } from 'express';

const discoverSettingRoutes = Router();

discoverSettingRoutes.post('/', async (req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const sliders = req.body as DiscoverSlider[];

  if (!Array.isArray(sliders)) {
    return res.status(400).json({ message: 'Invalid request body.' });
  }

  // Check every slider first, so a bad one leaves all of them as they were.
  // Built-in sliders keep their data, which the checks leave alone.
  const sliderData: (string | undefined)[] = [];

  for (const slider of sliders) {
    const prepared = prepareCustomSliderData(slider.type, slider.data);

    if (!prepared.valid) {
      return res.status(400).json({ message: prepared.message });
    }

    sliderData.push(prepared.data);
  }

  for (let x = 0; x < sliders.length; x++) {
    const slider = sliders[x];
    const existingSlider = await sliderRepository.findOne({
      where: {
        id: slider.id,
      },
    });

    if (existingSlider && slider.id) {
      existingSlider.enabled = slider.enabled;
      existingSlider.order = x;

      // Only allow changes to the following when the slider is not built in
      if (!existingSlider.isBuiltIn) {
        existingSlider.title = slider.title;
        existingSlider.data = sliderData[x];
        existingSlider.type = slider.type;
      }

      await sliderRepository.save(existingSlider);
    } else {
      const newSlider = new DiscoverSlider({
        isBuiltIn: false,
        data: sliderData[x],
        title: slider.title,
        enabled: slider.enabled,
        order: x,
        type: slider.type,
      });
      await sliderRepository.save(newSlider);
    }
  }

  return res.json(sliders);
});

discoverSettingRoutes.post('/add', async (req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const slider = req.body as DiscoverSlider;
  const prepared = prepareCustomSliderData(slider.type, slider.data);

  if (!prepared.valid) {
    return res.status(400).json({ message: prepared.message });
  }

  const newSlider = new DiscoverSlider({
    isBuiltIn: false,
    data: prepared.data,
    title: slider.title,
    enabled: false,
    order: -1,
    type: slider.type,
  });
  await sliderRepository.save(newSlider);

  return res.json(newSlider);
});

discoverSettingRoutes.get('/reset', async (_req, res) => {
  const sliderRepository = getRepository(DiscoverSlider);

  await sliderRepository.clear();
  await DiscoverSlider.bootstrapSliders();

  return res.status(204).send();
});

discoverSettingRoutes.put('/:sliderId', async (req, res, next) => {
  const sliderRepository = getRepository(DiscoverSlider);

  const slider = req.body as DiscoverSlider;

  try {
    const existingSlider = await sliderRepository.findOneOrFail({
      where: {
        id: Number(req.params.sliderId),
      },
    });

    // Only allow changes to the following when the slider is not built in
    if (!existingSlider.isBuiltIn) {
      const prepared = prepareCustomSliderData(slider.type, slider.data);

      if (!prepared.valid) {
        return res.status(400).json({ message: prepared.message });
      }

      existingSlider.title = slider.title;
      existingSlider.data = prepared.data;
      existingSlider.type = slider.type;
    }

    await sliderRepository.save(existingSlider);

    return res.status(200).json(existingSlider);
  } catch (e) {
    logger.error('Something went wrong updating a slider.', {
      label: 'API',
      errorMessage: e.message,
    });
    next({ status: 404, message: 'Slider not found or cannot be updated.' });
  }
});

discoverSettingRoutes.delete('/:sliderId', async (req, res, next) => {
  const sliderRepository = getRepository(DiscoverSlider);

  try {
    const slider = await sliderRepository.findOneOrFail({
      where: { id: Number(req.params.sliderId), isBuiltIn: false },
    });

    await sliderRepository.remove(slider);

    return res.status(204).send();
  } catch (e) {
    logger.error('Something went wrong deleting a slider.', {
      label: 'API',
      errorMessage: e.message,
    });
    next({ status: 404, message: 'Slider not found or cannot be deleted.' });
  }
});

export default discoverSettingRoutes;
