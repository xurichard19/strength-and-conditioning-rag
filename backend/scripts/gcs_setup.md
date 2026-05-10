# GCS Setup And Document Upload

Full process used to set up Google Cloud Storage for this project and upload the local source documents from `data/raw` into the bucket.

Relevant Documentation:

- [https://docs.cloud.google.com/storage/docs/uploading-objects#storage-upload-object-client-libraries](https://docs.cloud.google.com/storage/docs/uploading-objects#storage-upload-object-client-libraries)
- [https://docs.cloud.google.com/storage/docs/authentication](https://docs.cloud.google.com/storage/docs/authentication)
- [https://docs.cloud.google.com/docs/authentication/application-default-credentials](https://docs.cloud.google.com/docs/authentication/application-default-credentials)
- [https://docs.cloud.google.com/storage/docs/access-control/iam-roles](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)

## What Was Set Up

The following was completed:

1. Created a Google Cloud project.
2. Ensured the project had an active billing account.
3. Created a Cloud Storage bucket.
4. Created the logical folder structure `raw/system` in the bucket.
5. Created/configured a service account in `IAM & Admin`.
6. Granted the service account Cloud Storage permissions.
7. Installed the Google Cloud CLI locally.
8. Configured local authentication with Application Default Credentials (ADC).
9. Added a Python upload script to this repo.
10. Dry-ran the upload command.
11. Uploaded the files from `data/raw` into the GCS bucket.

## Prerequisites

Before starting, make sure you have:

- a Google account with access to create/use a Google Cloud project
- billing enabled on the project
- access to the project in the Google Cloud Console
- Python available locally
- Homebrew installed on macOS if using the recommended install path for `gcloud`

## 1. Create Or Select A Google Cloud Project

In the Google Cloud Console:

1. Open the project selector.
2. Create a new project or select an existing one.
3. Confirm the project has billing enabled.

This is required because Cloud Storage resources are created inside a project, and many operations will not work correctly without billing configured.

## 2. Create A Cloud Storage Bucket

In the Google Cloud Console:

1. Go to `Cloud Storage`.
2. Create a new bucket.
3. Choose a globally unique bucket name.

Example used during setup:

```text
rag_data_bucket1
```

Recommended settings:

- storage class: `Standard`
- public access: `Not public`
- use bucket IAM rather than public ACL-style access

## 3. Create The Bucket Prefix Structure

Inside the bucket, create the following folders:

```text
raw/system/
```

This matches the intended storage convention and the upload script.

Resulting object layout should look like:

```text
gs://<bucket_name>/raw/system/<filename>.pdf
```

## 4. Configure IAM / Service Account Access

In the Google Cloud Console:

1. Click three lines on the top left and go to `IAM & Admin`.
2. Go to service accounts on left hand side
3. Create a service account named something like S&c rag backend or something
4. Grant the required permissions (below).
5. Go back to IAM on the left hand side.
6. Grand access to this new service account on the view by principles tab.
7. ALSO GRANT access and those permissions for your own main google account/email the service account is not really used yet
  1. MAKE SURE you have this main google account that you are using gcs with as granted access on the IAM page

Permissions used in this setup:

- `Storage Object User`
- `Storage Admin`

Note:

- `Storage Object User` is the key role needed for uploads.
- `Storage Admin` is broader than strictly necessary, but it was granted during setup.
- If you want tighter permissions later, reduce this to the minimum required roles.

The service account was also granted access in IAM so it can be used in the project context.

## 5. Install Google Cloud CLI Locally

Installation Guide: [https://docs.cloud.google.com/sdk/docs/install-sdk](https://docs.cloud.google.com/sdk/docs/install-sdk)

Verify installation:

```bash
gcloud --version
```

If `gcloud` is not found after install, restart your shell or reload your shell config.

## 6. Initialize Google Cloud CLI

Run:

```bash
gcloud init
```

This step:

- signs you into Google Cloud in the CLI
- lets you choose the project
- configures local CLI defaults

## 7. Configure Local Authentication For Client Libraries

This project uses the Python `google-cloud-storage` client library. That library authenticates using Application Default Credentials (ADC).

Set up ADC locally by running:

```bash
gcloud auth application-default login
```

This opens a browser login flow and stores local credentials that Python client libraries can use automatically.

Optional verification:

```bash
gcloud auth application-default print-access-token
```

If that returns a token, ADC is configured correctly.

## 8. Install Python Dependencies

Make sure the environment has the GCS Python dependency installed.

This repo now includes:

```text
google-cloud-storage==3.2.0
```

Install dependencies:

```bash
python3 -m pip install -r requirements.txt
```

If you are using the project virtual environment, activate it first:

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Important:

- use the same Python interpreter for both `pip install` and script execution
- if you run the script with `python3`, prefer `python3 -m pip install ...`
- if you run inside `.venv`, use that same environment consistently

## 9. Upload Script Location

The upload script used for this workflow is:

```text
scripts/upload_to_gcs.py
```

Its job is to:

- scan `data/raw`
- filter supported files (`.pdf`, `.txt`)
- preserve relative structure
- upload to the target bucket prefix
- support dry-run mode before real upload

## 10. Understand The Upload Path Mapping

The script defaults are:

- source directory: `./data/raw`
- destination prefix: `raw/system`

That means a file like:

```text
data/raw/example.pdf
```

will upload to:

```text
gs://<bucket_name>/raw/system/example.pdf
```

## 11. Run A Dry Run First

Before uploading anything, run:

```bash
python scripts/upload_to_gcs.py --bucket <bucket_name> --dry-run
```

Or, if using `python3` explicitly:

```bash
python3 scripts/upload_to_gcs.py --bucket <bucket_name> --dry-run
```

What dry-run does:

- scans files
- prints the target object paths
- does not upload anything
- does not modify bucket contents

Expected summary looked like:

```text
Source:      /.../data/raw
Bucket:      <bucket_name>
Dest prefix: raw/system
Files found: 46
Mode:        DRY-RUN
Overwrite:   False
```

This confirmed:

- correct source directory
- correct bucket name
- correct object prefix
- 46 files found

## 12. Run The Real Upload

Once the dry run looks correct, run:

```bash
python scripts/upload_to_gcs.py --bucket <bucket_name>
```

Or:

```bash
python3 scripts/upload_to_gcs.py --bucket <bucket_name>
```

This performs the actual upload.

By default, the script uses create-only semantics rather than overwrite semantics.

That means it tries to create each object only if it does not already exist.

## 13. Verify Upload Results

After upload, verify in one or both ways below.

### In Google Cloud Console

Open the bucket and confirm files appear under:

```text
raw/system/
```

### In CLI

List uploaded objects:

```bash
gcloud storage ls "gs://<bucket_name>/raw/system/"
```

Count them:

```bash
gcloud storage ls "gs://<bucket_name>/raw/system/" | wc -l
```

You should see approximately the same number of uploaded files as the dry run discovered.

## 14. Commands Summary

### Initialize CLI

```bash
gcloud init
```

### Configure ADC

```bash
gcloud auth application-default login
```

### Verify ADC

```bash
gcloud auth application-default print-access-token
```

### Install Python dependencies

```bash
python3 -m pip install -r requirements.txt
```

### Dry run upload

```bash
python3 scripts/upload_to_gcs.py --bucket <bucket_name> --dry-run
```

### Real upload

```bash
python3 scripts/upload_to_gcs.py --bucket <bucket_name>
```

## 16. Current Outcome

At this point:

- the Google Cloud project exists
- billing is active
- the Cloud Storage bucket exists
- the bucket includes the `raw/system` path
- local authentication via ADC is configured
- the upload script works
- the dry run successfully discovered and mapped the local corpus
- the real upload completed successfully

## 17. Next Step

Update paths for the vector stuff