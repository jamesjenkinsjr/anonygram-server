const app = require('../src/app');
const TestHelpers = require('./test-helpers');
const { removeFromS3 } = require('../src/utils/file-util');

describe('Images Endpoints', () => {
  let db = TestHelpers.setupTestDB(app);
  const mockUsers = TestHelpers.mockUsers();
  const mockSubmissions = TestHelpers.mockSubmissions();
  const coordinatesGreenwich = TestHelpers.coordinatesGreenwich();
  const coordinatesQuito = TestHelpers.coordinatesQuito();
  const endpointPath = '/api/images';

  /*****************************************************************
    SETUP
  ******************************************************************/
  before('cleanup', () => TestHelpers.truncateAllTables(db));

  afterEach('cleanup', () => TestHelpers.truncateAllTables(db));

  after('disconnect from db', () => db.destroy());

  /*****************************************************************
    GET /api/images
  ******************************************************************/
  describe(`GET ${endpointPath}`, () => {
    context('Given Invalid Query Params', () => {
      const expectedMsg1 = 'Invalid value provided for sort param';
      it(`responds 400 "${expectedMsg1}" when sort param is invalid`, () => {
        const query = '/?sort=invalid';
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(400, { error: expectedMsg1 });
      });

      const expectedMsg2 = 'lat and lon parameters are required';
      it(`responds 400 "${expectedMsg2}" when lat and lon params are not provided`, () => {
        const query = '/?sort=new';
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(400, { error: expectedMsg2 });
      });

      const expectedMsg3 = 'lat and lon parameters are invalid';
      it(`responds 400 "${expectedMsg3}" when lat and lon params are invalid`, () => {
        const query = '/?sort=new&lat=string&lon=string';
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(400, { error: expectedMsg3 });
      });

      const expectedMsg4 = 'page parameter is invalid';
      it(`responds 400 "${expectedMsg4}" when page param is invalid`, () => {
        const query = `/?sort=new&lat=${coordinatesGreenwich.lat}&lon=${coordinatesGreenwich.lon}&page=string`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(400, { error: expectedMsg4 });
      });

      const expectedMsg5 = 'distance parameter is invalid';
      it(`responds 400 "${expectedMsg5}" when distance param is invalid`, () => {
        const query = `/?sort=new&lat=${coordinatesGreenwich.lat}&lon=${coordinatesGreenwich.lon}&page=1&distance=string`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(400, { error: expectedMsg5 });
      });
    });

    context('Given Valid Query Params', () => {
      beforeEach('insert submissions', () =>
        TestHelpers.seedSubmissions(db, mockSubmissions)
      );

      it('responds 200 and an array of submissions within 20km of the queried lat/lon (Greenwich)', () => {
        const query = `/?sort=new&lat=${coordinatesGreenwich.lat}&lon=${coordinatesGreenwich.lon}`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(200)
          .then((res) => {
            const [greenwichSubmission] = res.body;
            chai.expect(res.body.length).to.eql(1);
            chai.expect(greenwichSubmission.id).to.eql(1);
          });
      });

      it('responds 200 and an array of submissions within 20km of the queried lat/lon (Quito)', () => {
        const query = `/?sort=new&lat=${coordinatesQuito.lat}&lon=${coordinatesQuito.lon}`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(200)
          .then((res) => {
            const [quitoSubmission] = res.body;
            chai.expect(res.body.length).to.eql(1);
            chai.expect(quitoSubmission.id).to.eql(2);
          });
      });

      it('responds 200 and an array of submissions within 20000km of the queried lat/lon (Greenwich)', () => {
        const query = `/?sort=new&lat=${coordinatesGreenwich.lat}&lon=${coordinatesGreenwich.lon}&distance=20000`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(200)
          .then((res) => {
            chai.expect(res.body.length).to.eql(2);
          });
      });

      // TODO: sort by new
      it.skip('responds 200 and an array of submissions sorted by timestamp', () => {
        const query = `/?sort=new&lat=${coordinatesGreenwich.lat}&lon=${coordinatesGreenwich.lon}&distance=20000`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(200)
          .then((res) => {

          });
      });

      // TODO: sort by top
      it.skip('responds 200 and an array of submissions sorted by karma_total', () => {
        const query = `/?sort=top&lat=${coordinatesGreenwich.lat}&lon=${coordinatesGreenwich.lon}&distance=20000`;
        return supertest(app)
          .get(`${endpointPath}${query}`)
          .expect(200)
          .then((res) => {

          });
      });
    });
  });

  /*****************************************************************
    POST /api/images
  ******************************************************************/
  describe(`POST ${endpointPath}`, () => {
    const uploadsPath = './uploads';
    const imagePath = './test/fixtures/yikyak.png';
    const NSFWimagePath = './test/fixtures/sausage.jpg';

    afterEach('should remove uploaded file from disk', () => {
      chai.expect(uploadsPath).to.be.a.directory().and.empty;
    });

    context('Given Invalid Submission', () => {
      const expectedMsg1 = 'latitude and longitude parameters are required';
      it(`responds 400 "${expectedMsg1}" when lat and lon is not included in the submission`, () => {
        return supertest(app)
          .post(endpointPath)
          .attach('someImage', imagePath)
          .expect(400, { error: expectedMsg1 });
      });

      const expectedMsg2 = 'latitude and longitude parameters are invalid';
      it(`responds 400 "${expectedMsg2}" when the submission's lat and lon are invalid`, () => {
        return supertest(app)
          .post(endpointPath)
          .field('latitude', 'string')
          .field('longitude', 'string')
          .attach('someImage', imagePath)
          .expect(400, { error: expectedMsg2 });
      });

      const expectedMsg3 = 'provided content does not meet community guidelines';
      it(`responds 400 "${expectedMsg3}" when submission image is potentially NSFW`, () => {
        return supertest(app)
          .post(endpointPath)
          .field('latitude', coordinatesGreenwich.lat)
          .field('longitude', coordinatesGreenwich.lon)
          .attach('someImage', NSFWimagePath)
          .expect(400, { error: expectedMsg3 });
      });
    });

    context('Given Valid Submission', () => {
      let s3ObjectKey = '';
      afterEach('cleanup image submission from s3', async () => {
        await removeFromS3(s3ObjectKey);
      });

      it('responds 201 and the submission JSON (image_url on s3, truncated lat/lon, karma 0, id 1)', async () => {
        const testCaption = 'test caption';
        const REGEX_BASE_IMAGE_URL = /^https:\/\/anonygram-images\.s3\.amazonaws\.com\//i;
        let truncLat = coordinatesGreenwich.lat.split('.');
        truncLat = `${truncLat[0]}.${truncLat[1].substring(0, 3)}`;
        let truncLon = coordinatesGreenwich.lon.split('.');
        truncLon = `${truncLon[0]}.${truncLon[1].substring(0, 3)}`;

        return await supertest(app)
          .post(endpointPath)
          .field('latitude', coordinatesGreenwich.lat)
          .field('longitude', coordinatesGreenwich.lon)
          .field('image_text', testCaption)
          .attach('someImage', imagePath)
          .expect(201)
          .then(async (res) => {
            // set key for s3 cleanup after tests are done
            const url = await res.body.image_url;
            s3ObjectKey = url.substring(url.lastIndexOf('/') + 1);

            chai.expect(res.body.id).to.eql(1);
            chai.expect(url).to.match(REGEX_BASE_IMAGE_URL);
            chai.expect(res.body.image_text).to.eql(testCaption);
            chai.expect(res.body.karma_total).to.eql(0);
            chai.expect(res.body.latitude).to.eql(truncLat);
            chai.expect(res.body.longitude).to.eql(truncLon);
          });
      });
    });
  });

  /*****************************************************************
    PATCH /api/images/:submission_id
  ******************************************************************/
  describe(`PATCH ${endpointPath}/:submission_id`, () => {
    //
  });

  /*****************************************************************
    DELETE /api/images/:submission_id
  ******************************************************************/
  describe(`DELETE ${endpointPath}/:submission_id`, () => {
    //
  });
});
