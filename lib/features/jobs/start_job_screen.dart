import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/session/app_session.dart';
import '../../models/quote.dart';
import '../../models/work_order_request.dart';
import '../../services/n8n_webhook_service.dart';

enum _IntakeStage { triage, availability, options, booking, active }

class _ServiceOption {
  const _ServiceOption({
    required this.key,
    required this.label,
    required this.defaultDescription,
    required this.estimatedAmount,
    required this.icon,
  });

  final String key;
  final String label;
  final String defaultDescription;
  final double estimatedAmount;
  final IconData icon;
}

class StartJobScreen extends StatefulWidget {
  const StartJobScreen({super.key});

  @override
  State<StartJobScreen> createState() => _StartJobScreenState();
}

class _StartJobScreenState extends State<StartJobScreen> {
  final _service = N8nWebhookService();
  final _descriptionController = TextEditingController(
    text: 'Intermittent power issue after a prior repair.',
  );
  final _addressController = TextEditingController(text: '10 UAT Street');
  final _suburbController = TextEditingController(text: 'Richmond');

  _IntakeStage _stage = _IntakeStage.triage;
  String _tradeType = 'electrical';
  String _jobType = 'fault_finding';
  String _urgency = 'normal';
  String _propertyScenario = 'rental';
  String? _selectedAvailability;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _intakeResult;
  List<Quote> _quotes = const [];
  String? _approvalId;
  Quote? _selectedQuote;
  Map<String, dynamic>? _bookingResult;

  @override
  void initState() {
    super.initState();
    final user = appSession.user;
    _propertyScenario = user?.propertyScenario ??
        (user?.persona == UserPersona.tenant ? 'rental' : 'owner_occupied');
    if (_propertyScenario == 'owner_occupied') {
      _tradeType = 'plumbing';
      _jobType = 'leak_repair';
      _descriptionController.text = 'Leaking tap in the kitchen.';
      _addressController.text = '20 UAT Owner Street';
    }
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _addressController.dispose();
    _suburbController.dispose();
    super.dispose();
  }

  bool get _isRental => _propertyScenario == 'rental';

  String get _propertyLabel {
    final address = _addressController.text.trim();
    final suburb = _suburbController.text.trim();
    if (address.isEmpty && suburb.isEmpty) return 'Property to confirm';
    if (suburb.isEmpty) return address;
    return '$address, $suburb';
  }

  static const Map<String, String> _tradeOptions = {
    'electrical': 'Electrical',
    'plumbing': 'Plumbing',
    'hvac': 'Heating',
    'general_maintenance': 'General',
  };

  static const Map<String, List<_ServiceOption>> _serviceOptionsByTrade = {
    'electrical': [
      _ServiceOption(
        key: 'fault_finding',
        label: 'Power fault',
        defaultDescription: 'Intermittent power issue after a prior repair.',
        estimatedAmount: 360,
        icon: Icons.electrical_services_outlined,
      ),
      _ServiceOption(
        key: 'safety_check',
        label: 'Safety check',
        defaultDescription: 'Electrical safety check requested.',
        estimatedAmount: 220,
        icon: Icons.health_and_safety_outlined,
      ),
      _ServiceOption(
        key: 'power_point_install',
        label: 'Power point',
        defaultDescription: 'Install or repair a power point.',
        estimatedAmount: 420,
        icon: Icons.power_outlined,
      ),
      _ServiceOption(
        key: 'lighting_repair',
        label: 'Lighting',
        defaultDescription: 'Light fitting or switch issue.',
        estimatedAmount: 280,
        icon: Icons.lightbulb_outline,
      ),
    ],
    'plumbing': [
      _ServiceOption(
        key: 'leak_repair',
        label: 'Leak',
        defaultDescription: 'Leaking tap in the kitchen.',
        estimatedAmount: 240,
        icon: Icons.water_drop_outlined,
      ),
      _ServiceOption(
        key: 'blocked_drain',
        label: 'Blocked drain',
        defaultDescription: 'Blocked drain or slow draining fixture.',
        estimatedAmount: 320,
        icon: Icons.water_damage_outlined,
      ),
      _ServiceOption(
        key: 'toilet_repair',
        label: 'Toilet',
        defaultDescription: 'Toilet is leaking, blocked, or not flushing.',
        estimatedAmount: 260,
        icon: Icons.wc_outlined,
      ),
      _ServiceOption(
        key: 'hot_water_issue',
        label: 'Hot water',
        defaultDescription: 'Hot water is not working properly.',
        estimatedAmount: 380,
        icon: Icons.local_fire_department_outlined,
      ),
    ],
    'hvac': [
      _ServiceOption(
        key: 'heating_fault',
        label: 'Heating fault',
        defaultDescription: 'Heating is not working properly.',
        estimatedAmount: 330,
        icon: Icons.thermostat_outlined,
      ),
      _ServiceOption(
        key: 'cooling_fault',
        label: 'Cooling fault',
        defaultDescription: 'Cooling is not working properly.',
        estimatedAmount: 330,
        icon: Icons.ac_unit_outlined,
      ),
      _ServiceOption(
        key: 'service_clean',
        label: 'Service',
        defaultDescription: 'Heating or cooling unit service requested.',
        estimatedAmount: 260,
        icon: Icons.cleaning_services_outlined,
      ),
    ],
    'general_maintenance': [
      _ServiceOption(
        key: 'door_window_repair',
        label: 'Door/window',
        defaultDescription: 'Door, window, lock, or handle needs repair.',
        estimatedAmount: 260,
        icon: Icons.door_front_door_outlined,
      ),
      _ServiceOption(
        key: 'carpentry_repair',
        label: 'Carpentry',
        defaultDescription: 'General carpentry or fixture repair required.',
        estimatedAmount: 300,
        icon: Icons.carpenter_outlined,
      ),
      _ServiceOption(
        key: 'general_repair',
        label: 'General repair',
        defaultDescription: 'General maintenance repair required.',
        estimatedAmount: 300,
        icon: Icons.handyman_outlined,
      ),
    ],
  };

  List<_ServiceOption> get _serviceOptions =>
      _serviceOptionsByTrade[_tradeType] ?? _serviceOptionsByTrade.values.first;

  _ServiceOption get _selectedServiceOption {
    return _serviceOptions.firstWhere(
      (option) => option.key == _jobType,
      orElse: () => _serviceOptions.first,
    );
  }

  bool get _canApproveInApp {
    final persona = appSession.user?.persona;
    return persona == UserPersona.ownerOccupier ||
        persona == UserPersona.landlord;
  }

  List<String> get _availabilityOptions {
    if (_isRental) {
      return const [
        'Thu 4 Jun, 9:00 am to 12:00 pm - tenant available',
        'Fri 5 Jun, 2:00 pm to 4:00 pm - tenant backup',
        'Mon 8 Jun, 10:00 am to 12:00 pm - access by appointment',
      ];
    }
    return const [
      'Mon 8 Jun, 10:00 am to 12:00 pm - owner available',
      'Tue 9 Jun, 1:00 pm to 4:00 pm - owner backup',
      'Wed 10 Jun, 9:00 am to 11:00 am - key safe access',
    ];
  }

  Future<void> _runIntake() async {
    if (_descriptionController.text.trim().isEmpty ||
        _addressController.text.trim().isEmpty) {
      setState(() => _error = 'Add the issue and address first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _intakeResult = null;
      _quotes = const [];
      _approvalId = null;
      _selectedQuote = null;
      _bookingResult = null;
    });

    try {
      final response = await _service.createWorkOrder(_request().toJson());
      if (!mounted) return;
      setState(() {
        _intakeResult = response;
        _stage = _IntakeStage.options;
      });
      await _fetchOptions(response['work_order_id']?.toString());
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _fetchOptions(String? workOrderId) async {
    if (workOrderId == null || workOrderId.isEmpty) return;
    setState(() => _busy = true);
    try {
      final response = await _service.fetchQuoteOptions(workOrderId);
      final optionData = response['options'] as List<dynamic>? ?? const [];
      final quotes = optionData
          .whereType<Map<String, dynamic>>()
          .map(Quote.fromJson)
          .toList();
      if (!mounted) return;
      setState(() {
        _approvalId = response['approval_id']?.toString();
        _quotes = quotes;
        if (quotes.isNotEmpty) _selectedQuote = quotes.first;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approveSelectedQuote() async {
    final quote = _selectedQuote;
    final approvalId = _approvalId;
    if (quote == null || approvalId == null || approvalId.isEmpty) {
      setState(() => _error = 'Pick a quote option first.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final response = await _service.approveQuoteOption(
        approvalId: approvalId,
        optionId: quote.id,
      );
      if (!mounted) return;
      setState(() {
        _bookingResult = response;
        _stage = _IntakeStage.active;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  WorkOrderRequest _request() {
    final user = appSession.user;
    final requesterRole = _requesterRole(user);
    final availability = [
      if (_selectedAvailability != null) _selectedAvailability!,
      ..._availabilityOptions
          .where((item) => item != _selectedAvailability)
          .take(1),
    ];

    return WorkOrderRequest(
      customerName: user?.name ?? 'UAT Customer',
      phone: user?.persona == UserPersona.ownerOccupier
          ? '0400000002'
          : '0400000001',
      email: user?.email ?? 'uat.customer@1pacent.com',
      address: _addressController.text.trim(),
      suburb: _suburbController.text.trim(),
      tradeType: _tradeType,
      jobType: _jobType,
      description: _descriptionController.text.trim(),
      urgency: _urgency,
      propertyScenario: _propertyScenario,
      requesterRole: requesterRole,
      approvalRecipientRole: _isRental ? 'landlord' : 'owner',
      requesterAvailability: availability,
      consentToContact: true,
      consentToStore: true,
      estimatedAmount: _estimateAmount(),
      agencyId: 'AGENCY-UAT-001',
      propertyManagerId: 'PM-UAT-001',
      landlordId: _isRental ? 'LL-UAT-001' : 'LL-UAT-OWNER-001',
      tenantId: _isRental ? 'TEN-UAT-001' : 'OWNER-UAT-001',
      propertyId: user?.propertyId ??
          (_isRental ? 'PROP-UAT-001' : 'PROP-UAT-OWNER-001'),
    );
  }

  String _requesterRole(AppUser? user) {
    if (_isRental) {
      return user?.persona == UserPersona.landlord ? 'landlord' : 'tenant';
    }
    return 'owner';
  }

  double _estimateAmount() {
    return _selectedServiceOption.estimatedAmount;
  }

  void _selectTrade(String value) {
    final nextOptions =
        _serviceOptionsByTrade[value] ?? _serviceOptionsByTrade.values.first;
    final nextJob = nextOptions.first;
    setState(() {
      _tradeType = value;
      _jobType = nextJob.key;
      _descriptionController.text = nextJob.defaultDescription;
    });
  }

  void _selectJobType(String value) {
    final option = _serviceOptions.firstWhere(
      (item) => item.key == value,
      orElse: () => _serviceOptions.first,
    );
    setState(() {
      _jobType = option.key;
      _descriptionController.text = option.defaultDescription;
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = appSession.user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('1pacent'),
        actions: [
          IconButton(
            tooltip: 'Chat with Sally',
            icon: const Icon(Icons.support_agent_outlined),
            onPressed: () => context.go('/sally'),
          ),
          IconButton(
            tooltip: 'Track current job',
            icon: const Icon(Icons.route_outlined),
            onPressed: _intakeResult == null
                ? null
                : () => context.go('/job/${_intakeResult!['work_order_id']}'),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            _RequestMapHeader(
              stage: _stage,
              title: _heroTitle(user),
              subtitle: _heroSubtitle,
              propertyLabel: _propertyLabel,
              serviceLabel: _selectedServiceOption.label,
              tradeLabel: _tradeOptions[_tradeType] ?? _tradeType,
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
                children: [
                  _PersonaBanner(user: user),
                  const SizedBox(height: 12),
                  _StepSwitch(
                    stage: _stage,
                    triage: _triageCard(),
                    availability: _availabilityCard(),
                    options: _optionsCard(),
                    booking: _bookingCard(),
                    active: _activeCard(),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    _NoticeCard(
                      icon: Icons.error_outline,
                      title: 'Something needs attention',
                      body: _error!,
                      tone: _NoticeTone.warning,
                    ),
                  ],
                ],
              ),
            ),
            _BottomActionBar(
              busy: _busy,
              label: _buttonLabel,
              icon: _buttonIcon,
              enabled: _buttonEnabled,
              onPressed: _onPrimaryAction,
            ),
          ],
        ),
      ),
    );
  }

  String _heroTitle(AppUser? user) {
    if (_stage == _IntakeStage.active) return 'Job booked';
    if (_stage == _IntakeStage.options) {
      return _canApproveInApp ? 'Choose your option' : 'Options ready';
    }
    return user?.persona == UserPersona.tenant
        ? 'Report a rental issue'
        : 'Request a tradie';
  }

  String get _heroSubtitle {
    switch (_stage) {
      case _IntakeStage.triage:
        return 'Confirm the service and property details.';
      case _IntakeStage.availability:
        return 'Choose access windows that match real tradie availability.';
      case _IntakeStage.options:
        return 'Compare available tradie options.';
      case _IntakeStage.booking:
        return 'Confirm the service option.';
      case _IntakeStage.active:
        return 'The booking is active and ready for tracking.';
    }
  }

  String get _buttonLabel {
    switch (_stage) {
      case _IntakeStage.triage:
        return 'Continue';
      case _IntakeStage.availability:
        return 'See matches';
      case _IntakeStage.options:
        return _canApproveInApp ? 'Request this tradie' : 'Track approval';
      case _IntakeStage.booking:
        return 'Confirm booking';
      case _IntakeStage.active:
        return 'Track job';
    }
  }

  IconData get _buttonIcon {
    switch (_stage) {
      case _IntakeStage.triage:
        return Icons.arrow_forward;
      case _IntakeStage.availability:
        return Icons.manage_search_outlined;
      case _IntakeStage.options:
        return _canApproveInApp
            ? Icons.check_circle_outline
            : Icons.route_outlined;
      case _IntakeStage.booking:
        return Icons.event_available_outlined;
      case _IntakeStage.active:
        return Icons.route_outlined;
    }
  }

  bool get _buttonEnabled {
    if (_busy) return false;
    if (_stage == _IntakeStage.availability) {
      return _selectedAvailability != null;
    }
    if (_stage == _IntakeStage.booking) return _selectedQuote != null;
    return true;
  }

  void _onPrimaryAction() {
    switch (_stage) {
      case _IntakeStage.triage:
        setState(() {
          _stage = _IntakeStage.availability;
          _error = null;
          _selectedAvailability ??= _availabilityOptions.first;
        });
        return;
      case _IntakeStage.availability:
        _runIntake();
        return;
      case _IntakeStage.options:
        if (_canApproveInApp) {
          setState(() => _stage = _IntakeStage.booking);
        } else {
          final workOrderId = _intakeResult?['work_order_id']?.toString();
          if (workOrderId != null) context.go('/job/$workOrderId');
        }
        return;
      case _IntakeStage.booking:
        _approveSelectedQuote();
        return;
      case _IntakeStage.active:
        final workOrderId = _bookingResult?['work_order_id']?.toString() ??
            _intakeResult?['work_order_id']?.toString();
        if (workOrderId != null) context.go('/job/$workOrderId');
        return;
    }
  }

  Widget _triageCard() {
    return _IntakeCard(
      title: 'What service is needed?',
      subtitle: 'The right details help avoid repeat visits and wrong quotes.',
      children: [
        _TradeTabs(
          value: _tradeType,
          options: _tradeOptions,
          onChanged: _selectTrade,
        ),
        const SizedBox(height: 16),
        _ServicePicker(
          value: _jobType,
          options: _serviceOptions,
          onChanged: _selectJobType,
        ),
        const SizedBox(height: 16),
        _LocationFields(
          addressController: _addressController,
          suburbController: _suburbController,
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _descriptionController,
          minLines: 3,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Tell Sally what happened',
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        _SegmentedChoice(
          label: 'Urgency',
          value: _urgency,
          options: const {
            'normal': 'Flexible',
            'high': 'Soon',
            'emergency': 'Urgent',
          },
          onChanged: (value) => setState(() => _urgency = value),
        ),
      ],
    );
  }

  Widget _availabilityCard() {
    final label = _isRental ? 'tenant' : 'owner';
    return _IntakeCard(
      title: 'When can the $label provide access?',
      subtitle: 'Only matching appointment windows will be offered.',
      children: [
        for (final option in _availabilityOptions) ...[
          _ChoiceRow(
            selected: _selectedAvailability == option,
            title: option,
            subtitle: option == _availabilityOptions.first
                ? 'Best match candidate'
                : 'Backup access window',
            onTap: () => setState(() => _selectedAvailability = option),
          ),
          const SizedBox(height: 8),
        ],
        const _NoticeCard(
          icon: Icons.verified_user_outlined,
          title: 'Warranty first',
          body:
              'Repeat issues and warranty coverage are checked before new paid options are offered.',
        ),
      ],
    );
  }

  Widget _optionsCard() {
    final workOrderId = _intakeResult?['work_order_id']?.toString();
    if (_quotes.isEmpty) {
      return _IntakeCard(
        title: 'Matching quote options',
        subtitle: 'We are checking availability, price and trust signals.',
        children: [
          if (workOrderId != null) Text('Reference: $workOrderId'),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed:
                workOrderId == null ? null : () => _fetchOptions(workOrderId),
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh options'),
          ),
        ],
      );
    }

    return _IntakeCard(
      title:
          _canApproveInApp ? 'Pick a service option' : 'Sent to the approver',
      subtitle: _canApproveInApp
          ? 'Each option already fits the selected access window and tradie availability.'
          : 'The owner or landlord receives these options for approval.',
      children: [
        for (final quote in _quotes) ...[
          _QuoteOptionRow(
            quote: quote,
            selected: _selectedQuote?.id == quote.id,
            canSelect: _canApproveInApp,
            onTap: () => setState(() => _selectedQuote = quote),
          ),
          const SizedBox(height: 10),
        ],
        if (workOrderId != null)
          TextButton.icon(
            onPressed: () => context.go('/job/$workOrderId'),
            icon: const Icon(Icons.route_outlined),
            label: const Text('Open status'),
          ),
      ],
    );
  }

  Widget _bookingCard() {
    final quote = _selectedQuote;
    return _IntakeCard(
      title: 'Request booking',
      subtitle:
          'Confirm the option and the appointment request will be locked in.',
      children: [
        if (quote != null) _QuoteOptionRow(quote: quote, selected: true),
        const SizedBox(height: 10),
        const _NoticeCard(
          icon: Icons.auto_awesome_outlined,
          title: 'Tradie acceptance',
          body:
              'Available tradies can auto-accept by policy, or confirm manually when required.',
        ),
      ],
    );
  }

  Widget _activeCard() {
    final workOrderId = _bookingResult?['work_order_id']?.toString() ??
        _intakeResult?['work_order_id']?.toString() ??
        'pending';
    final message = _bookingResult?['message']?.toString() ??
        _bookingResult?['next_action']?.toString() ??
        'The job has been booked.';
    return _IntakeCard(
      title: 'Active job',
      subtitle:
          'Next steps are completion evidence, warranty record and payment.',
      children: [
        _NoticeCard(
          icon: Icons.task_alt,
          title: workOrderId,
          body: message,
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => context.go('/job/$workOrderId'),
          icon: const Icon(Icons.route_outlined),
          label: const Text('Track status'),
        ),
      ],
    );
  }
}

class _RequestMapHeader extends StatelessWidget {
  const _RequestMapHeader({
    required this.stage,
    required this.title,
    required this.subtitle,
    required this.propertyLabel,
    required this.serviceLabel,
    required this.tradeLabel,
  });

  final _IntakeStage stage;
  final String title;
  final String subtitle;
  final String propertyLabel;
  final String serviceLabel;
  final String tradeLabel;

  @override
  Widget build(BuildContext context) {
    final activeIndex = _IntakeStage.values.indexOf(stage);
    final colorScheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 226,
      child: Stack(
        children: [
          Positioned.fill(
            child: CustomPaint(
              painter: _MapHeaderPainter(
                primary: colorScheme.primary.withValues(alpha: 0.42),
                road: colorScheme.outlineVariant.withValues(alpha: 0.9),
                background: colorScheme.surfaceContainerHighest,
              ),
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  colorScheme.surface.withValues(alpha: 0.96),
                  colorScheme.surface.withValues(alpha: 0.70),
                  colorScheme.surface.withValues(alpha: 0.18),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(subtitle),
                const Spacer(),
                _RouteSummary(
                  propertyLabel: propertyLabel,
                  serviceLabel: serviceLabel,
                  tradeLabel: tradeLabel,
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    for (var index = 0;
                        index < _IntakeStage.values.length;
                        index++) ...[
                      _StepDot(active: index <= activeIndex, index: index + 1),
                      if (index < _IntakeStage.values.length - 1)
                        Expanded(
                          child: Container(
                            height: 2,
                            color: index < activeIndex
                                ? colorScheme.primary
                                : colorScheme.outlineVariant,
                          ),
                        ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MapHeaderPainter extends CustomPainter {
  const _MapHeaderPainter({
    required this.primary,
    required this.road,
    required this.background,
  });

  final Color primary;
  final Color road;
  final Color background;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = background);

    final roadPaint = Paint()
      ..color = road
      ..strokeWidth = 3
      ..style = PaintingStyle.stroke;
    final routePaint = Paint()
      ..color = primary
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    for (final y in [34.0, 92.0, 156.0]) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y + 28), roadPaint);
    }
    for (final x in [42.0, 156.0, 286.0, 418.0]) {
      canvas.drawLine(Offset(x, 0), Offset(x - 64, size.height), roadPaint);
    }

    final route = Path()
      ..moveTo(size.width * 0.16, size.height * 0.70)
      ..quadraticBezierTo(
        size.width * 0.40,
        size.height * 0.32,
        size.width * 0.62,
        size.height * 0.56,
      )
      ..quadraticBezierTo(
        size.width * 0.78,
        size.height * 0.72,
        size.width * 0.90,
        size.height * 0.42,
      );
    canvas.drawPath(route, routePaint);

    final dotPaint = Paint()..color = primary;
    canvas.drawCircle(
      Offset(size.width * 0.16, size.height * 0.70),
      7,
      dotPaint,
    );
    canvas.drawCircle(
      Offset(size.width * 0.90, size.height * 0.42),
      7,
      dotPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _MapHeaderPainter oldDelegate) {
    return primary != oldDelegate.primary ||
        road != oldDelegate.road ||
        background != oldDelegate.background;
  }
}

class _RouteSummary extends StatelessWidget {
  const _RouteSummary({
    required this.propertyLabel,
    required this.serviceLabel,
    required this.tradeLabel,
  });

  final String propertyLabel;
  final String serviceLabel;
  final String tradeLabel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colorScheme.outlineVariant),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Icon(Icons.home_outlined, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  propertyLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.build_outlined, size: 20, color: colorScheme.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '$tradeLabel - $serviceLabel',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TradeTabs extends StatelessWidget {
  const _TradeTabs({
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final entry in options.entries) ...[
            ChoiceChip(
              label: Text(entry.value),
              selected: value == entry.key,
              onSelected: (_) => onChanged(entry.key),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _ServicePicker extends StatelessWidget {
  const _ServicePicker({
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String value;
  final List<_ServiceOption> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 112,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: options.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final option = options[index];
          final selected = option.key == value;
          return _ServiceOptionTile(
            option: option,
            selected: selected,
            onTap: () => onChanged(option.key),
          );
        },
      ),
    );
  }
}

class _ServiceOptionTile extends StatelessWidget {
  const _ServiceOptionTile({
    required this.option,
    required this.selected,
    required this.onTap,
  });

  final _ServiceOption option;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 126,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? colorScheme.primaryContainer : colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? colorScheme.primary : colorScheme.outlineVariant,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(option.icon,
                color: selected ? colorScheme.primary : colorScheme.onSurface),
            const Spacer(),
            Text(
              option.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 2),
            Text('From \$${option.estimatedAmount.toStringAsFixed(0)}'),
          ],
        ),
      ),
    );
  }
}

class _LocationFields extends StatelessWidget {
  const _LocationFields({
    required this.addressController,
    required this.suburbController,
  });

  final TextEditingController addressController;
  final TextEditingController suburbController;

  @override
  Widget build(BuildContext context) {
    final addressField = TextField(
      controller: addressController,
      decoration: const InputDecoration(
        prefixIcon: Icon(Icons.home_outlined),
        labelText: 'Property address',
        border: OutlineInputBorder(),
      ),
    );
    final suburbField = TextField(
      controller: suburbController,
      decoration: const InputDecoration(
        labelText: 'Suburb',
        border: OutlineInputBorder(),
      ),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 520) {
          return Column(
            children: [
              addressField,
              const SizedBox(height: 10),
              suburbField,
            ],
          );
        }

        return Row(
          children: [
            Expanded(flex: 3, child: addressField),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: suburbField),
          ],
        );
      },
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({required this.active, required this.index});

  final bool active;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: 14,
      backgroundColor: active ? colorScheme.primary : colorScheme.surface,
      child: Text(
        '$index',
        style: TextStyle(
          color: active ? colorScheme.onPrimary : colorScheme.onSurfaceVariant,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _StepSwitch extends StatelessWidget {
  const _StepSwitch({
    required this.stage,
    required this.triage,
    required this.availability,
    required this.options,
    required this.booking,
    required this.active,
  });

  final _IntakeStage stage;
  final Widget triage;
  final Widget availability;
  final Widget options;
  final Widget booking;
  final Widget active;

  @override
  Widget build(BuildContext context) {
    switch (stage) {
      case _IntakeStage.triage:
        return triage;
      case _IntakeStage.availability:
        return availability;
      case _IntakeStage.options:
        return options;
      case _IntakeStage.booking:
        return booking;
      case _IntakeStage.active:
        return active;
    }
  }
}

class _PersonaBanner extends StatelessWidget {
  const _PersonaBanner({required this.user});

  final AppUser? user;

  @override
  Widget build(BuildContext context) {
    if (user == null) return const SizedBox.shrink();
    return _NoticeCard(
      icon: Icons.account_circle_outlined,
      title: '${user!.name} - ${user!.personaLabel}',
      body: user!.propertyId == null
          ? 'No property selected yet. UAT defaults will be used.'
          : 'Property relationship: ${user!.propertyId}',
    );
  }
}

class _IntakeCard extends StatelessWidget {
  const _IntakeCard({
    required this.title,
    required this.subtitle,
    required this.children,
  });

  final String title;
  final String subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _SegmentedChoice extends StatelessWidget {
  const _SegmentedChoice({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final entry in options.entries)
              ChoiceChip(
                label: Text(entry.value),
                selected: value == entry.key,
                onSelected: (_) => onChanged(entry.key),
              ),
          ],
        ),
      ],
    );
  }
}

class _ChoiceRow extends StatelessWidget {
  const _ChoiceRow({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected
                ? Theme.of(context).colorScheme.primary
                : Theme.of(context).colorScheme.outlineVariant,
          ),
        ),
        child: Row(
          children: [
            Icon(selected
                ? Icons.radio_button_checked
                : Icons.radio_button_unchecked),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(subtitle),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuoteOptionRow extends StatelessWidget {
  const _QuoteOptionRow({
    required this.quote,
    required this.selected,
    this.canSelect = false,
    this.onTap,
  });

  final Quote quote;
  final bool selected;
  final bool canSelect;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: canSelect ? onTap : null,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? colorScheme.primaryContainer : colorScheme.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: selected ? colorScheme.primary : colorScheme.outlineVariant,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (canSelect) ...[
                  Icon(selected ? Icons.check_circle : Icons.circle_outlined),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: Text(
                    quote.displayName,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Text(
                  '\$${quote.amount.toStringAsFixed(0)}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ],
            ),
            if (quote.scheduledWindow.isNotEmpty) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.schedule_outlined, size: 18),
                  const SizedBox(width: 6),
                  Expanded(child: Text(quote.scheduledWindow)),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (quote.totalScore != null)
                  _MetricChip(label: 'Confidence ${quote.totalScore!.round()}'),
                if (quote.trustScore != null)
                  _MetricChip(label: 'Trust ${quote.trustScore!.round()}'),
                if (quote.availabilityScore != null)
                  _MetricChip(
                      label:
                          'Availability ${quote.availabilityScore!.round()}'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(label),
      visualDensity: VisualDensity.compact,
    );
  }
}

enum _NoticeTone { neutral, warning }

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.icon,
    required this.title,
    required this.body,
    this.tone = _NoticeTone.neutral,
  });

  final IconData icon;
  final String title;
  final String body;
  final _NoticeTone tone;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final color = tone == _NoticeTone.warning
        ? colorScheme.errorContainer
        : colorScheme.surfaceContainerHighest;
    return Card(
      color: color,
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: Text(body),
      ),
    );
  }
}

class _BottomActionBar extends StatelessWidget {
  const _BottomActionBar({
    required this.busy,
    required this.label,
    required this.icon,
    required this.enabled,
    required this.onPressed,
  });

  final bool busy;
  final String label;
  final IconData icon;
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: enabled ? onPressed : null,
            icon: busy
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(icon),
            label: Text(busy ? 'Working' : label),
          ),
        ),
      ),
    );
  }
}
