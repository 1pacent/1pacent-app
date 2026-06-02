import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/app_session.dart';
import '../../models/work_order_request.dart';
import '../../services/n8n_webhook_service.dart';

class StartJobScreen extends StatefulWidget {
  const StartJobScreen({super.key});

  @override
  State<StartJobScreen> createState() => _StartJobScreenState();
}

class _StartJobScreenState extends State<StartJobScreen> {
  final _formKey = GlobalKey<FormState>();
  final _service = N8nWebhookService();

  final _nameController = TextEditingController(text: 'Mark Demo');
  final _phoneController = TextEditingController(text: '0400 000 000');
  final _emailController = TextEditingController(text: 'aussiemacs@gmail.com');
  final _addressController = TextEditingController(text: '1 Beach Street');
  final _suburbController = TextEditingController(text: 'Richmond');
  final _descriptionController = TextEditingController(
      text: 'Install two new power points in the kitchen.');
  final _availabilityOneController =
      TextEditingController(text: 'Monday morning');
  final _availabilityTwoController =
      TextEditingController(text: 'Thursday 2:00 pm to 4:00 pm');

  String _tradeType = 'electrical';
  String _jobType = 'power_point_install';
  String _urgency = 'normal';
  String _propertyScenario = 'rental';
  bool _contactConsent = true;
  bool _storeConsent = true;
  bool _submitting = false;
  Map<String, dynamic>? _result;
  String? _error;

  @override
  void initState() {
    super.initState();
    final user = appSession.user;
    if (user == null) return;

    _nameController.text = user.name;
    _emailController.text = user.email;
    _propertyScenario = user.propertyScenario ??
        (user.persona == UserPersona.tenant ? 'rental' : 'owner_occupied');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _suburbController.dispose();
    _descriptionController.dispose();
    _availabilityOneController.dispose();
    _availabilityTwoController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
      _result = null;
    });

    final request = WorkOrderRequest(
      customerName: _nameController.text.trim(),
      phone: _phoneController.text.trim(),
      email: _emailController.text.trim(),
      address: _addressController.text.trim(),
      suburb: _suburbController.text.trim(),
      tradeType: _tradeType,
      jobType: _jobType,
      description: _descriptionController.text.trim(),
      urgency: _urgency,
      propertyScenario: _propertyScenario,
      requesterRole: _propertyScenario == 'rental' ? 'tenant' : 'owner',
      approvalRecipientRole:
          _propertyScenario == 'rental' ? 'landlord' : 'owner',
      requesterAvailability: [
        _availabilityOneController.text.trim(),
        _availabilityTwoController.text.trim(),
      ].where((value) => value.isNotEmpty).toList(),
      consentToContact: _contactConsent,
      consentToStore: _storeConsent,
    );

    try {
      final response = await _service.createWorkOrder(request.toJson());
      if (!mounted) return;
      setState(() => _result = response);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Request a tradie')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Tell us what you need',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text(
                'Share the job once, then we handle triage, quote options, availability and status updates.'),
            const SizedBox(height: 20),
            _SectionCard(
              icon: Icons.person_outline,
              title: 'Contact',
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _propertyScenario,
                  decoration: const InputDecoration(labelText: 'Property type'),
                  items: const [
                    DropdownMenuItem(
                        value: 'rental', child: Text('Rental property')),
                    DropdownMenuItem(
                        value: 'owner_occupied',
                        child: Text('Owner occupied home')),
                  ],
                  onChanged: (value) => setState(
                      () => _propertyScenario = value ?? _propertyScenario),
                ),
                _TextField(controller: _nameController, label: 'Name'),
                _TextField(controller: _phoneController, label: 'Mobile'),
                _TextField(
                    controller: _emailController,
                    label: 'Email',
                    keyboardType: TextInputType.emailAddress),
              ],
            ),
            _SectionCard(
              icon: Icons.home_repair_service_outlined,
              title: 'Job',
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _tradeType,
                  decoration: const InputDecoration(labelText: 'Trade'),
                  items: const [
                    DropdownMenuItem(
                        value: 'electrical', child: Text('Electrician')),
                    DropdownMenuItem(value: 'plumbing', child: Text('Plumber')),
                    DropdownMenuItem(
                        value: 'hvac', child: Text('Heating and cooling')),
                    DropdownMenuItem(
                        value: 'carpentry', child: Text('Carpentry')),
                    DropdownMenuItem(
                        value: 'general_maintenance',
                        child: Text('General maintenance')),
                  ],
                  onChanged: (value) =>
                      setState(() => _tradeType = value ?? _tradeType),
                ),
                DropdownButtonFormField<String>(
                  initialValue: _jobType,
                  decoration: const InputDecoration(labelText: 'Job type'),
                  items: const [
                    DropdownMenuItem(
                        value: 'power_point_install',
                        child: Text('Power point install')),
                    DropdownMenuItem(
                        value: 'fault_finding', child: Text('Fault finding')),
                    DropdownMenuItem(
                        value: 'leak_repair', child: Text('Leak repair')),
                    DropdownMenuItem(
                        value: 'safety_check', child: Text('Safety check')),
                    DropdownMenuItem(
                        value: 'general_repair', child: Text('General repair')),
                  ],
                  onChanged: (value) =>
                      setState(() => _jobType = value ?? _jobType),
                ),
                _TextField(
                    controller: _descriptionController,
                    label: 'What needs doing?',
                    maxLines: 3),
                DropdownButtonFormField<String>(
                  initialValue: _urgency,
                  decoration: const InputDecoration(labelText: 'Urgency'),
                  items: const [
                    DropdownMenuItem(value: 'normal', child: Text('Flexible')),
                    DropdownMenuItem(value: 'high', child: Text('Soon')),
                    DropdownMenuItem(value: 'emergency', child: Text('Urgent')),
                  ],
                  onChanged: (value) =>
                      setState(() => _urgency = value ?? _urgency),
                ),
              ],
            ),
            _SectionCard(
              icon: Icons.place_outlined,
              title: 'Where and when',
              children: [
                _TextField(controller: _addressController, label: 'Address'),
                _TextField(controller: _suburbController, label: 'Suburb'),
                _TextField(
                    controller: _availabilityOneController,
                    label: _propertyScenario == 'rental'
                        ? 'Tenant best time'
                        : 'Owner best time'),
                _TextField(
                    controller: _availabilityTwoController,
                    label: _propertyScenario == 'rental'
                        ? 'Tenant backup time'
                        : 'Owner backup time',
                    required: false),
              ],
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('You can contact me about this job'),
              value: _contactConsent,
              onChanged: (value) => setState(() => _contactConsent = value),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text(
                  'Store this enquiry for quotes, warranty and invoices'),
              value: _storeConsent,
              onChanged: (value) => setState(() => _storeConsent = value),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _submitting || !_contactConsent || !_storeConsent
                  ? null
                  : _submit,
              icon: _submitting
                  ? const SizedBox.square(
                      dimension: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.send_outlined),
              label: Text(_submitting ? 'Sending request' : 'Request tradie'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              _StatusPanel(title: 'Could not send request', body: _error!),
            ],
            if (_result != null) ...[
              const SizedBox(height: 12),
              _SuccessPanel(result: _result!),
            ],
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard(
      {required this.icon, required this.title, required this.children});

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final spacedChildren = <Widget>[];
    for (final child in children) {
      if (spacedChildren.isNotEmpty) {
        spacedChildren.add(const SizedBox(height: 10));
      }
      spacedChildren.add(child);
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon),
                const SizedBox(width: 8),
                Text(title, style: Theme.of(context).textTheme.titleMedium),
              ],
            ),
            const SizedBox(height: 12),
            ...spacedChildren,
          ],
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.label,
    this.maxLines = 1,
    this.required = true,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String label;
  final int maxLines;
  final bool required;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      decoration:
          InputDecoration(labelText: label, border: const OutlineInputBorder()),
      validator: (value) {
        if (!required) return null;
        if (value == null || value.trim().isEmpty) return 'Required';
        return null;
      },
    );
  }
}

class _SuccessPanel extends StatelessWidget {
  const _SuccessPanel({required this.result});

  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context) {
    final workOrderId = result['work_order_id']?.toString() ??
        result['job_id']?.toString() ??
        'pending';
    final nextAction = result['next_action']?.toString() ??
        'We will confirm the next step shortly.';
    return Card(
      color: const Color(0xFFEAF6EF),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Request sent',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text('Reference: $workOrderId'),
            const SizedBox(height: 6),
            Text(nextAction),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () => context.go('/job/$workOrderId'),
              icon: const Icon(Icons.route_outlined),
              label: const Text('Track status'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFFFF1ED),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(body),
          ],
        ),
      ),
    );
  }
}
