class Customer {
  const Customer({required this.id, required this.name, this.phone, this.email});

  final String id;
  final String name;
  final String? phone;
  final String? email;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'phone': phone,
        'email': email,
      };
}
