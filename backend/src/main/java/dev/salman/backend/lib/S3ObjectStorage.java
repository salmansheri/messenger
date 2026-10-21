package dev.salman.backend.lib;

import java.net.URI;
import java.time.Duration;

import org.springframework.stereotype.Component;

import dev.salman.backend.config.AppProperties;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

/**
 * Talks to any S3-compatible service with path-style addressing. The bucket is created on first use, so a fresh
 * environment needs no setup step and the application still starts when the store is down.
 */
@Component
public class S3ObjectStorage implements ObjectStorage {

	private final S3Client client;
	private final S3Presigner presigner;
	private final String bucket;
	private volatile boolean bucketReady;

	public S3ObjectStorage(AppProperties props) {
		var storage = props.storage();
		var credentials = StaticCredentialsProvider
				.create(AwsBasicCredentials.create(storage.accessKey(), storage.secretKey()));
		var region = Region.of(storage.region());
		var settings = S3Configuration.builder().pathStyleAccessEnabled(true).build();
		var publicEndpoint = storage.publicEndpoint() == null || storage.publicEndpoint().isBlank()
				? storage.endpoint() : storage.publicEndpoint();
		this.bucket = storage.bucket();
		this.client = S3Client.builder().endpointOverride(URI.create(storage.endpoint())).region(region)
				.credentialsProvider(credentials).serviceConfiguration(settings).build();
		this.presigner = S3Presigner.builder().endpointOverride(URI.create(publicEndpoint)).region(region)
				.credentialsProvider(credentials).serviceConfiguration(settings).build();
	}

	@Override
	public void put(String key, byte[] bytes, String contentType) {
		ensureBucket();
		client.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(),
				RequestBody.fromBytes(bytes));
	}

	@Override
	public void delete(String key) {
		client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
	}

	@Override
	public String signedUrl(String key, Duration ttl) {
		var request = GetObjectPresignRequest.builder().signatureDuration(ttl)
				.getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(key).build()).build();
		return presigner.presignGetObject(request).url().toString();
	}

	private void ensureBucket() {
		if (bucketReady) {
			return;
		}
		try {
			client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
		}
		catch (NoSuchBucketException missing) {
			try {
				client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
			}
			catch (BucketAlreadyOwnedByYouException raced) {
				// another instance created it first
			}
		}
		bucketReady = true;
	}

}
