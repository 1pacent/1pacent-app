import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';

class UploadedFile {
  const UploadedFile({
    required this.url,
    this.id,
    this.fileName,
    this.contentType,
    this.sizeBytes,
  });

  final String url;
  final String? id;
  final String? fileName;
  final String? contentType;
  final int? sizeBytes;

  factory UploadedFile.fromJson(Map<String, dynamic> json) {
    return UploadedFile(
      url: json['url']?.toString() ??
          json['file_url']?.toString() ??
          json['image_url']?.toString() ??
          '',
      id: json['id']?.toString() ?? json['file_id']?.toString(),
      fileName: json['file_name']?.toString() ?? json['name']?.toString(),
      contentType: json['content_type']?.toString() ?? json['mime']?.toString(),
      sizeBytes: (json['size'] as num?)?.toInt() ??
          (json['size_bytes'] as num?)?.toInt(),
    );
  }
}

class FileUploadService {
  FileUploadService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  /// Upload photo bytes to n8n webhook and return the uploaded file URL.
  Future<UploadedFile> uploadPhoto({
    required Uint8List bytes,
    required String fileName,
    String? jobId,
    String? photoType,
  }) async {
    final uri = Uri.parse('${AppConfig.n8nBaseUrl}${AppConfig.uploadPhotoWebhook}');

    final request = http.MultipartRequest('POST', uri);
    request.files.add(http.MultipartFile.fromBytes(
      'file',
      bytes,
      filename: fileName,
    ));
    if (jobId != null && jobId.isNotEmpty) {
      request.fields['job_id'] = jobId;
    }
    if (photoType != null && photoType.isNotEmpty) {
      request.fields['photo_type'] = photoType;
    }

    final streamedResponse = await request.send();
    final response = await http.Response.fromStream(streamedResponse);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FileUploadException(
          'Upload failed (${response.statusCode}): ${response.body}');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return UploadedFile.fromJson(decoded);
    }
    return UploadedFile(url: decoded.toString());
  }

  /// Upload a base64-encoded image to n8n webhook.
  Future<UploadedFile> uploadBase64Image({
    required String base64Data,
    required String fileName,
    String? jobId,
    String? photoType,
  }) async {
    final uri = Uri.parse('${AppConfig.n8nBaseUrl}${AppConfig.uploadPhotoWebhook}');

    final payload = <String, dynamic>{
      'file_data': base64Data,
      'file_name': fileName,
    };
    if (jobId != null && jobId.isNotEmpty) {
      payload['job_id'] = jobId;
    }
    if (photoType != null && photoType.isNotEmpty) {
      payload['photo_type'] = photoType;
    }

    final response = await _client.post(
      uri,
      headers: const {'content-type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FileUploadException(
          'Upload failed (${response.statusCode}): ${response.body}');
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return UploadedFile.fromJson(decoded);
    }
    return UploadedFile(url: decoded.toString());
  }
}

class FileUploadException implements Exception {
  const FileUploadException(this.message);

  final String message;

  @override
  String toString() => 'FileUploadException: $message';
}
